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

//Template Reader / Parser
class TemplateParser {
    constructor(path, finishedEmitter) {
        this.appendID = 0;
        this.content = fs.readFileSync(path, 'utf8');
    }   
    workOnTemplate(data) {
        console.log(this.content);
        Mustache.parse(this.content);    
        var rendered = Mustache.render(this.content, data);
        Mustache.parse(rendered);  
        return rendered;
    }
    appendTemplate(dom, data) {
        data['_appendID'] = "MID_" + (this.appendID++);
        data['_currentTime'] = moment().format("HH:mm:ss");
        this.appendDivider(dom, data);
    }
    overrideTemplate(dom, data) {
        dom.html(this.workOnTemplate(data));
    }
    appendDivider(dom, data) { 
        dom.append(this.workOnTemplate(data));
    }

    scrollToCurrentID(dom) {
        console.log("Scroll!");
        console.log(dom);
        console.log($("#MID_"+(this.appendID-1)).offset().top);
        dom.animate({ scrollTop: dom[0].scrollHeight }, 50);    
    }
}
//-----------------
const chatMessageTemplate = new TemplateParser("renderer/templates/chat.html");
const ChannelViewerTemplate = new TemplateParser("renderer/templates/channellist.html");
const ChannelSearchTemplate = new TemplateParser("renderer/templates/channelSearchElements.html");
const chatDividerTemplate = new TemplateParser("renderer/templates/chatDivider.html");


$('#connectToServer').click(sendUserCredentialsToMain); //If the user clicked on Login
$('#closeWindow').click(closeWindow);                   //If the user clicked "close window"
$('#minimizeWindow').click(minimizeWindow);       
$('#TextInput').keypress(mainKeypressCheck);            //If the user entered a chat message
ipcRenderer.on('TextReceiver', MumbleTextSendHandler);  //New chat message from server
ipcRenderer.on('TextEventReceiver', MumbleTextEventSendHandler);  //New chat message from server
ipcRenderer.on('ChannelInfoReceiver', MumbleChannelInfoEventSendHandler);  //New chat message from server
ipcRenderer.on('ChannelSearchReceiver', MumbleChannelSearchHandler);  //Answer from Channel Search

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
    chatDividerTemplate.appendDivider($('#TextWindow'), arg);
}
function MumbleChannelInfoEventSendHandler(event, arg) {
    ChannelViewerTemplate.overrideTemplate($('#channellist'), arg);
}
function MumbleChannelSearchHandler(event, arg) {
    console.log(arg);
    ChannelSearchTemplate.overrideTemplate($('#channel-search-found'), {channels: arg});
}


//--------------------------------
// File Transfer
//-------------------------------
$('html').on('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
});
$('#TextWindow').on('dragenter', function(e) {
        $('#dndoverlay').show();
        e.preventDefault();
        e.stopPropagation();
});

$('#dndoverlay').click(function(e) {
        $('#dndoverlay').hide();
        e.preventDefault();
        e.stopPropagation();
});
  
$('#dndoverlay').on('drop', function(e){
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
        $('#dndoverlay').show();
        var pastedContent = cb.files;
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

//---------------
//  Channel Viewer
//---------------
$('.panel-body, #channel-search-found').on('click', '.join-channel-link', function(e) {
    var id = $(this).attr("href").substring(1);  
    ipcRenderer.send("ChannelJoinByID", id);
});

$('#openChannelSearch').click(function(e) {
    $('#channel-search-overlay').show();
    $('#channel-search-input').focus();
});
$('#channel-search-window').click(function(e) {
    event.stopPropagation();
});
$('#channel-search-overlay').click(function(e) {
    $('#channel-search-overlay').hide();
    e.preventDefault();
    e.stopPropagation();
});

$('#channel-search-input').on('keyup', function(){
    var searchTerm = $(this).val();    
    ipcRenderer.send("ChannelSearchSender", searchTerm);
});

//----------
// Audio Control
//---------
muted = false;
deafed = false;
$('#self_deaf_toggle').hide();
$('#self_mute_toggle').hide();

$('#self_deaf_button').click(function() {
    deafed = !deafed;

    if(deafed) {
        $('#self_deaf_toggle').show();
        $('#self_mute_toggle').show();
        muted = true;
    }
    else {
        $('#self_deaf_toggle').hide();
        if(muted) {
            $('#self_mute_toggle').show();
        } else {
            $('#self_mute_toggle').hide();
        }
    }
    
    UserVoiceState = {};
    UserVoiceState['muted'] = muted;
    UserVoiceState['deafed'] = deafed;
    ipcRenderer.send("UserVoiceStateChanged", UserVoiceState);
});

$('#self_mute_button').click(function() {
    muted = !muted;

    if(muted)
        $('#self_mute_toggle').show();
    else {
        $('#self_mute_toggle').hide();
        $('#self_deaf_toggle').hide();
        deafed = false;
    }

    UserVoiceState = {};
    UserVoiceState['muted'] = muted;
    UserVoiceState['deafed'] = deafed;
    ipcRenderer.send("UserVoiceStateChanged", UserVoiceState);
});