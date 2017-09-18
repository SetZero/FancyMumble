// renderer process
const ipcRenderer = require('electron').ipcRenderer;
const remote = require('electron').remote;
const fs = require('fs');
const Mustache = require('mustache');


//-------------------
class TemplateParser {
    constructor(path) {
        var sefRef = this;  //save this so we can use it in fs
        this.appendID = 0;
        fs.readFile(path, 'utf8', function read(err, data) {
            if (err) {
                throw err;
            }
            sefRef.content = data;
        });    
    }   

    appendTemplate(dom, data) {
        data['_appendID'] = "MID_" + (this.appendID++);
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

const chatTemplate = new TemplateParser("renderer/templates/chat.html");


$('#connectToServer').click(sendUserCredentialsToMain); //If the user clicked on Login
$('#closeWindow').click(closeWindow);                   //If the user clicked "close window"
$('#minimizeWindow').click(minimizeWindow);       
$('#TextInput').keypress(mainKeypressCheck);            //If the user entered a chat message
ipcRenderer.on('TextReceiver', MumbleTextSendHandler);  //New chat message from server

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
        chatTemplate.appendTemplate($('#TextWindow'), sendArray);
        chatTemplate.scrollToCurrentID($('#TextWindow'));
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
    //$('#TextWindow').append(arg['username'] + ': ' + arg['message']);   
    arg['ProfileReplacement'] = arg['username'].charAt(0);
    chatTemplate.appendTemplate($('#TextWindow'), arg);
    chatTemplate.scrollToCurrentID($('#TextWindow'));
}


