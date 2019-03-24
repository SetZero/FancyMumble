"use strict";

const mumble = require('mumble');

const {app, BrowserWindow} = require('electron');
const {ipcMain} = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const clipboard = require('electron').clipboard;
const Speaker = require('speaker');
const mic = require('mic');
const mime = require('mime-types');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const tree = "";
const userInputGain = 5.5;

//Mumble Options
const options = {
    key: fs.readFileSync('certs/key.pem'),
    cert: fs.readFileSync('certs/cert.pem')
};
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let mumbleConnection;
let micInputStream;
let mumbleInputStream;

const MumbleChannelManager = require("./src/ChannelManager.js");


//------------------
//Classes

//------------------
let channelManager;


//------------------

function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({
        transparent: false, frame: false,
        width: 600, height: 400
    });

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'renderer/index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Open the DevTools.
    win.webContents.openDevTools();
    ipcMain.on('CredentialSender', MumbleCredentialsHandler);
    ipcMain.on('TextSender', MumbleTextSendHandler);
    ipcMain.on('ImageSender', MumbleImageSendHandler);
    ipcMain.on('ImageFileSender', MumbleImageFileSendHandler);
    ipcMain.on('UserVoiceStateChanged', UserVoiceStateHandler);
    //mumbleHandler();

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});

//---------------------------------
//Event Handler
//---------------------------------

const onInit = function (connection) {

    console.log('Connection initialized');
    const user = connection.users[connection.sessionId];
    const channel = connection.channels[0];
    //console.log(channel);
};

const sessions = {};

const onUserState = function (state) {
    sessions[state.session] = state;
    channelManager.updateUserChannelTree();
};

const onMumbleError = function (state) {
    console.log("Failed to execute: " + state + "\n");
};

const onEvent = function (data) {
    //console.log('event', data.handler, 'data', data.message);
};

const onText = function (data) {
    const dom = new JSDOM(data.message);
    let children = dom.window.document.getElementsByTagName('meta');
    let isVideo = false;
    let src;

    const sendArray = {};
    const user = mumbleConnection.userBySession(data.actor);
    sendArray.username = user.name;

    for(let i = 0; i < children.length; i++) {
        let tag = children[i].getAttribute("http-equiv");
        if(tag === 'isVideo') isVideo = true;
        src = dom.window.document.getElementsByTagName('img')[0].getAttribute("src");
        src = src.replace('data:image/PNG;base64,', '');
        if(isVideo) break;
    }

    if(isVideo) {
        sendArray.message = '<video width="320" height="240" controls><source src="data:video/mp4;base64,' + src + ' "/></video>';
    } else {
        sendArray.message = data.message;
    }

    //console.log(data);

    win.webContents.send("TextReceiver", sendArray);
};


//Microphone
const onMicSilence = function () {
    console.log("Got SIGNAL silence");
    mumbleInputStream.gain = 0;
};
const onMicVoice = function () {
    console.log("Got SIGNAL voice");
    mumbleInputStream.gain = userInputGain;
};
const onReady = function (connection) {
    console.log("Ready!");
    const speaker = new Speaker({
        channels: 1,          // 2 channels
        bitDepth: 16,         // 16-bit samples
        sampleRate: 48000,     // 44,100 Hz sample rate
    });

    mumbleConnection.outputStream(true).pipe(speaker);


    const mumbleInputInstance = mic({
        rate: '24000', //24000
        channels: '1',
        debug: false,
        exitOnSilence: 2,
        bitwidth: '16'
    });
    mumbleInputStream = mumbleConnection.inputStream({sampleRate: 48000, gain: userInputGain})
    micInputStream = mumbleInputInstance.getAudioStream();
    micInputStream.pipe(mumbleInputStream);
    mumbleInputInstance.start();
    micInputStream.on('silence', onMicSilence);
    micInputStream.on('voice', onMicVoice);
    showMainMenu();
};
//---------------------------------
// Mumble Functions
//---------------------------------



function showMainMenu() {
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'renderer/mainWindow.html'),
        protocol: 'file:',
        slashes: true
    }));
    const bounds = win.getBounds();
    bounds.x -= 600;
    bounds.y -= 300;
    bounds.width = 1200;
    bounds.height = 600;
    win.setBounds(bounds);
    win.webContents.on('did-finish-load', function () {
        channelManager.showJoinMessage();
        channelManager.updateUserChannelTree();
    });
}

function MumbleCredentialsHandler(event, arg) {
    console.log("Join: " + arg["server"] + ", Username: " + arg["username"]);
    mumbleHandler(arg["server"], arg["username"]);
}

function MumbleTextSendHandler(event, arg) {
    mumbleConnection.user.channel.sendMessage(arg['message']);
}

function MumbleImageSendHandler(event, arg) {
    console.log("Type: " + arg);
    fs.readFile(arg, function (err, data) {
        if (err) {
            throw err;
        }
        const buffer = (new Buffer(data).toString('base64'));
        console.log("Size: " + buffer.length);
        try {
            let mime_type = mime.lookup(arg);
            switch(mime_type) {
                case 'image/jpeg':
                case 'image/png':
                case 'image/bmp':
                case 'image/gif':
                    mumbleConnection.user.channel.sendMessage('<img src="data:' + mime_type + ';base64,' + encodeURIComponent(buffer) + ' "/>');
                    break;
                case 'video/mp4':
                    mumbleConnection.user.channel.sendMessage('<meta http-equiv="isVideo" content="true" /><img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + '"/>');
                    console.log("Sending Video...");
                    break;
                default:
            }
        } catch (err) {
            console.log("File error: " + err);
        }
        //mumbleConnection.user.channel.sendMessage('<video width="320" height="240" controls><source src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/></video>');
    });
}

function MumbleImageFileSendHandler(event, arg) {
    console.log("Got it!");
    let found = false;
    let maximumSize = 100 * 1024;
    let inBetween = 1024;

    let minQuality = 0;
    let maximumQuality = 100;
    let buffer;
    while(minQuality <= maximumQuality) {
        let middle = minQuality + ((maximumQuality - minQuality) / 2);
        middle = middle | 0;
        buffer = clipboard.readImage().toJPEG(middle);
        buffer = (new Buffer(buffer).toString('base64'));
        console.log("Size: " + (buffer.length / 1024));
        if(buffer.length  <= maximumSize - inBetween && Math.max(0, buffer.length) > maximumSize - inBetween) {
            break;
        } else {
            if((buffer.length) > maximumSize) {
                maximumQuality = middle - 1;
            } else {
                minQuality = middle + 1;
            }
        }
    }
    console.log("Size: " + (buffer.length / 1024));
    try {
        mumbleConnection.user.channel.sendMessage('<img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/>');
    } catch (err) {
        console.log("File error: " + err);
    }
};

//---------------------------
// Audio Control
//--------------------------

function UserVoiceStateHandler(event, arg) {
    mumbleConnection.user.setSelfDeaf(arg['deafed']);
    if (!arg['deafed'])
        mumbleConnection.user.setSelfMute(arg['muted']);
}

//--------------------------------
//Mumble Main Event
//---------------------------------
function mumbleHandler(serverIP, userName) {
    console.log('Connecting');
    mumble.connect(serverIP, options, function (error, connection) {
        if (error) {
            throw new Error(error);
        }

        console.log('Connected');

        mumbleConnection = connection;
        channelManager = new MumbleChannelManager(mumbleConnection, win);
        ipcMain.on('ChannelSearchSender', (event, arg) => {
             channelManager.MumbleChannelSearchHandler(event, arg);
        });
        ipcMain.on('ChannelJoinByID', (event, arg) => {
            channelManager.MumbleJoinChannelByIdHandler(event, arg);
        });

        connection.authenticate(userName);
        connection.on('initialized', onInit);
        connection.on('ready', onReady);
        //connection.on( 'voice',  onVoice );
        //connection.on( 'protocol-in', onEvent);
        connection.on('textMessage', onText);
        connection.on('userState', onUserState);
        connection.on('error', onMumbleError);
    });
}
