// renderer process
const ipcRenderer = require('electron').ipcRenderer;
const remote = require('electron').remote;
const fs = require('fs');
const Mustache = require('mustache');
const moment = require('moment');
const EventEmitter = require('events');

//-------------------
//Classes
//-------------------

//eventListener to Handle Observer Events
class MessageEmitter extends EventEmitter {
    constructor() {   
        super();
        this.finishedLoading = false;
        this.messageQueue = [];
        
        this.on('templateLoadingFinished', this.workOnQueue);
    }

    workOnQueue() {
        console.log(this.messageQueue);
        this.finishedLoading = true;
        this.messageQueue.forEach(function(element) {
            MumbleTextEventSendHandler(element[0], element[1]);   
        });    
    }
}

//Template Reader / Parser
class TemplateParser {
    constructor(path, finishedEmitter) {
        var sefRef = this;  //save this so we can use it in fs
        this.appendID = 0;
        fs.readFile(path, 'utf8', function read(err, data) {
            if (err) {
                throw err;
            }
            sefRef.content = data;
            if (typeof finishedEmitter !== 'undefined')
                finishedEmitter.emit('templateLoadingFinished');
        });    
    }   

    appendTemplate(dom, data) {
        data['_appendID'] = "MID_" + (this.appendID++);
        data['_currentTime'] = moment().format("HH:mm:ss");
        this.appendDivider(dom, data);
    }

    appendDivider(dom, data) {
        console.log(this.content);
        Mustache.parse(this.content);    
        var rendered = Mustache.render(this.content, data);
        Mustache.parse(rendered);   
        dom.append(rendered);
    }

    scrollToCurrentID(dom) {
        console.log("Scroll!");
        console.log(dom);
        console.log($("#MID_"+(this.appendID-1)).offset().top);
        dom.animate({ scrollTop: dom[0].scrollHeight }, 50);    
    }
}
//-----------------
const mEmitter = new MessageEmitter();
const chatMessageTemplate = new TemplateParser("renderer/templates/chat.html");
const chatDividerTemplate = new TemplateParser("renderer/templates/chatDivider.html", mEmitter);


$('#connectToServer').click(sendUserCredentialsToMain); //If the user clicked on Login
$('#closeWindow').click(closeWindow);                   //If the user clicked "close window"
$('#minimizeWindow').click(minimizeWindow);       
$('#TextInput').keypress(mainKeypressCheck);            //If the user entered a chat message
ipcRenderer.on('TextReceiver', MumbleTextSendHandler);  //New chat message from server
ipcRenderer.on('TextEventReceiver', MumbleTextEventSendHandler);  //New chat message from server

function mainKeypressCheck(event) {
    //User pressed Enter
    if (event.which == 13) {
        var sendArray = {};
        sendArray['message'] = $('#TextInput').val();
        $('#TextInput').val('');
        //Send to main js
        ipcRenderer.send("TextSender", sendArray);
        //Add Additional Information and Show it
        sendArray['username'] = "Ich";
        sendArray['ProfileReplacement'] = sendArray['username'].charAt(0);
        chatMessageTemplate.appendTemplate($('#TextWindow'), sendArray);
        chatMessageTemplate.scrollToCurrentID($('#TextWindow'));
        event.preventDefault();  
    }
}

function sendUserCredentialsToMain() {
    $(this).addClass("loading");
    var sendArray = {};
    sendArray['username'] = $('#loginUsername').val();
    sendArray['server'] = $('#loginServer').val();
    console.log("Send: ");
    console.log(sendArray);

    ipcRenderer.send("CredentialSender", sendArray);
}

function closeWindow() {
    var window = remote.getCurrentWindow();
    window.close();
}

function minimizeWindow() {
    var window = remote.getCurrentWindow();
    window.minimize();
}

function MumbleTextSendHandler(event, arg) {
    arg['ProfileReplacement'] = arg['username'].charAt(0);
    chatMessageTemplate.appendTemplate($('#TextWindow'), arg);
    chatMessageTemplate.scrollToCurrentID($('#TextWindow'));
}

function MumbleTextEventSendHandler(event, arg) {
    if(mEmitter.finishedLoading) {
        chatDividerTemplate.appendDivider($('#TextWindow'), arg);
    } else {
        var newElements = [event, arg];
        console.log(newElements);
        mEmitter.messageQueue.push(newElements);
        console.log("In Queue: ");
        console.log(mEmitter.messageQueue);
    }
}


//--------------------------------
// File Transfer
//-------------------------------
$('html').on(
    'dragover',
    function(e) {
        e.preventDefault();
        e.stopPropagation();
});
$('#TextWindow').on(
    'dragenter',
    function(e) {
        $('.overlay').show();
        e.preventDefault();
        e.stopPropagation();
});

$('.overlay').click(
    function(e) {
        $('.overlay').hide();
        e.preventDefault();
        e.stopPropagation();
});
  
$('.overlay').on(
    'drop',
    function(e){
        if(e.originalEvent.dataTransfer){
            if(e.originalEvent.dataTransfer.files.length) {
                e.preventDefault();
                e.stopPropagation();
                /*UPLOAD FILES HERE*/
                upload(e.originalEvent.dataTransfer.files);
            }  
        }
        e.preventDefault();
        e.stopPropagation();
});

$("html").on("paste", function(e) {
    var cb = event.clipboardData
    console.log(cb.types);
    if(cb.types.indexOf("Files") != -1){
        $('.overlay').show();
        var pastedContent = cb.files;
        //e.preventDefault();
       // e.stopPropagation();
        //console.log("Sending!");
        ipcRenderer.send("ImageFileSender", e);
    }
});

var extensions = ["jpg", "jpeg", "png", "gif", "mp4"];

function showUploadError() {
    $('.dropzone .empty-icon .icon').addClass('icon-cross').delay(1000).queue(function(){
        $(this).removeClass('icon-cross').dequeue();
    });
    $('.dropzone .empty-icon .icon').removeClass('icon-message').delay(1000).queue(function(){
        $(this).addClass('icon-message').dequeue();
    });
    $('.dropzone .empty-icon .icon').css('color', 'red').delay(1000).queue(function(){
        $(this).css('color', '#444').dequeue();
    });
}

function upload(data) {
    console.log(data);
    if(typeof data[0] === 'object') {
        if(extensions.indexOf(data[0].name.split('.').pop().toLowerCase()) >= 0) {
            ipcRenderer.send("ImageSender", data[0].path);
        } else {
            showUploadError();    
        }
    } else {
        console.log(typeof data[0]);
        showUploadError();
    }
}