"use strict";

var mumble = require('mumble');

const {app, BrowserWindow} = require('electron')
const {ipcMain} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs');
const clipboard = require('electron').clipboard
const Fuse = require('fuse.js')
const Speaker = require('speaker')
const mic = require('mic')

var tree = "";
var userInputGain = 5.5;

//Mumble Options 
var options = {
  key: fs.readFileSync( 'certs/key.pem' ),
  cert: fs.readFileSync( 'certs/cert.pem' )
};
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let mumbleConnection
let micInputStream
let mumbleInputStream




//------------------
//Classes
//------------------

class MumbleChannelManager {
  constructor() {
  }
  buildUserChannelTree() {
    var channelInfo = {};
    var list = mumbleConnection.users();
    channelInfo['users'] = {channels: []};
  
    for(var key in list) {
      var user = list[key];
      var index = channelFind(channelInfo['users']['channels'],  user.channel.name);
      if(index < 0) {
        var index = channelInfo['users']['channels'].push({channelname: user.channel.name, channelid: user.channel.id, users: []}) - 1; 
      }
      channelInfo['users']['channels'][index]['users'].push({username: user.name, userid: user.id});
    }
    return channelInfo;
  }
  
  updateUserChannelTree() {
    var channelInfo = this.buildUserChannelTree();
    win.webContents.send("ChannelInfoReceiver", channelInfo);
  }
  
  buildChannelTree(channel, level, channellist) {
    if(typeof channellist === 'undefined')
      var channellist = [];
    channellist.push({name: channel.name, id: channel.id, usercount: channel.users.length});
    for(var c in channel.children) {
      this.buildChannelTree(channel.children[c], level + 1, channellist);
    } 
    return channellist;
  }



  MumbleJoinChannelByIdHandler(event, arg) {
    console.log()
    var newChannel = mumbleConnection.user.client.channelById(arg);    
    try {
      newChannel.join();
      MumbleChannelManager.showJoinMessage(newChannel.name);
    }
    catch(err) {
      console.log("Failed to join Channel!");
    }
  }

  static showJoinMessage(ChannelName) {
    if (typeof ChannelName === 'undefined') { ChannelName = mumbleConnection.user.channel.name; }
    var sendArray = {};
    sendArray['dividerMessage'] = "Joined Channel " + ChannelName;
    win.webContents.send("TextEventReceiver", sendArray);
    return true;
  }
  
  MumbleChannelSearchHandler(event, arg) {
    if(typeof this.channels === 'undefined')
      this.channels = channelManager.buildChannelTree(mumbleConnection.rootChannel, 0); 

    var options = {
      shouldSort: true,
      threshold: 0.3,
      location: 0,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: [
        "name"
      ]
    };
    var fuse = new Fuse(this.channels, options); // "list" is the item array
    var result = fuse.search(arg);
    console.log(result);
    win.webContents.send("ChannelSearchReceiver", result);
  }
}

var channelManager = new MumbleChannelManager()

//------------------

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    transparent: false, frame: false,
    width: 600, height: 400
  })

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'renderer/index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  win.webContents.openDevTools();
  ipcMain.on('CredentialSender', MumbleCredentialsHandler);
  ipcMain.on('TextSender', MumbleTextSendHandler);
  ipcMain.on('ImageSender', MumbleImageSendHandler);
  ipcMain.on('ImageFileSender', MumbleImageFileSendHandler);
  ipcMain.on('ChannelJoinByID', channelManager.MumbleJoinChannelByIdHandler);
  ipcMain.on('ChannelSearchSender', channelManager.MumbleChannelSearchHandler);
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
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

//---------------------------------
//Event Handler
//---------------------------------

var onInit = function(connection) {

  console.log( 'Connection initialized' );
  var user = connection.users[connection.sessionId];
  var channel = connection.channels[0];
  console.log(channel);
};

var sessions = {};

var onUserState = function( state ) {
    sessions[state.session] = state;
    channelManager.updateUserChannelTree();
};

var onMumbleError = function( state ) {
    console.log("Failed to execute: " + state + "\n");
};

var onEvent = function( data ) {
  //console.log('event', data.handler, 'data', data.message);
};

var onText = function( data ) {
  console.log(data);
  var user = mumbleConnection.userBySession(data.actor);
  console.log(user.name + ':', data.message);
  var sendArray = {};
  sendArray["username"] = user.name;
  sendArray["message"] = data.message;

  win.webContents.send("TextReceiver", sendArray);
};

var onReady = function( connection ) {
  console.log("Ready!");
  const speaker = new Speaker({
    channels: 1,          // 2 channels
    bitDepth: 16,         // 16-bit samples
    sampleRate: 48000,     // 44,100 Hz sample rate
  });

  mumbleConnection.outputStream(true).pipe(speaker);

  
  var mumbleInputInstance = mic({
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


//Microphone
var onMicSilence = function() {
  console.log("Got SIGNAL silence");
  mumbleInputStream.gain = 0;
};
var onMicVoice = function() {
  console.log("Got SIGNAL voice");
  mumbleInputStream.gain = userInputGain;
};
//---------------------------------
// Mumble Functions
//---------------------------------
function channelFind(channelInfo, find) {
  for(var index in channelInfo) {
    if(channelInfo[index].channelname === find) {
      return index;
    }
  }
  return -1;
}


function showMainMenu() {
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'renderer/mainWindow.html'),
    protocol: 'file:',
    slashes: true
  }));
  var bounds = win.getBounds();
  bounds.x -= 600;
  bounds.y -= 300;
  bounds.width = 1200;
  bounds.height = 600;
  win.setBounds(bounds);
  win.webContents.on('did-finish-load', function() {
    MumbleChannelManager.showJoinMessage();
    channelManager.updateUserChannelTree();
  });
}

function MumbleCredentialsHandler(event, arg) {
  console.log("Join: " + arg["server"] + ", Username: " + arg["username"]);
  mumbleHandler(arg["server"], arg["username"]);
}

function MumbleTextSendHandler(event, arg) { 
  console.log(mumbleConnection);
  mumbleConnection.user.channel.sendMessage(arg['message']);
}

function MumbleImageSendHandler(event, arg) { 
  fs.readFile( arg, function (err, data) {
    if (err) {
      throw err; 
    }
    var buffer = (new Buffer(data).toString('base64'));
    console.log("Size: " + buffer.length);
    try {
      mumbleConnection.user.channel.sendMessage('<img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/>');
    } catch(err) {
      console.log("File error: " + err);
    }
    //mumbleConnection.user.channel.sendMessage('<video width="320" height="240" controls><source src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/></video>');
  });
}
function MumbleImageFileSendHandler(event, arg) { 
  console.log("Got it!");
  var buffer = clipboard.readImage().toJPEG(50);
  var buffer = (new Buffer(buffer).toString('base64'));
  console.log("Size: " + buffer.length);
  try {
    mumbleConnection.user.channel.sendMessage('<img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/>');
  } catch(err) {
    console.log("File error: " + err);
  }
};

//---------------------------
// Audio Control
//--------------------------

function UserVoiceStateHandler(event, arg) {
  mumbleConnection.user.setSelfDeaf(arg['deafed']);
  if(!arg['deafed'])
    mumbleConnection.user.setSelfMute(arg['muted']);
}

//--------------------------------
//Mumble Main Event
//---------------------------------
function mumbleHandler(serverIP, userName) {
  console.log( 'Connecting' );
  mumble.connect( serverIP, options, function ( error, connection ) {
    if( error ) { throw new Error( error ); }

    console.log( 'Connected' );

    mumbleConnection = connection;
    connection.authenticate( userName );
    connection.on( 'initialized', onInit );
    connection.on( 'ready', onReady );
    //connection.on( 'voice',  onVoice );
    //connection.on( 'protocol-in', onEvent);
    connection.on( 'textMessage', onText);
    connection.on( 'userState', onUserState);
    connection.on( 'error', onMumbleError);
  });
}
