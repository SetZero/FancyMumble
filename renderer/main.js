// renderer process
var ipcRenderer = require('electron').ipcRenderer;
const remote = require('electron').remote;
/*ipcRenderer.on('store-data', function (store) {
    console.log(store);
});*/

$('#connectToServer').click(sendUserCredentialsToMain);
$('#closeWindow').click(closeWindow);
$('#TextInput').keypress(mainKeypressCheck);
ipcRenderer.on('TextReceiver', MumbleTextSendHandler);

function mainKeypressCheck(event) {
    console.log("Test!");
    if (event.which == 13) {
        var sendArray = {};
        sendArray['message'] = $('#TextInput').val();
        $('#TextWindow').append(sendArray['message']);
        ipcRenderer.send("TextSender", sendArray);
        event.preventDefault();    //<---- Add this line
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

function MumbleTextSendHandler(event, arg) {
    $('#TextWindow').append(arg['username'] + ': ' + arg['message']);   
}