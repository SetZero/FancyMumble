const Fuse = require('fuse.js');
const mumble = require('mumble');

module.exports =  class MumbleChannelManager {
    constructor(mumbleConnection, win) {
        this.mumbleConnection = mumbleConnection;
        this.win = win;
    }

    showJoinMessage(ChannelName) {
        if (typeof ChannelName === 'undefined') {
            ChannelName = this.mumbleConnection.user.channel.name;
        }
        const sendArray = {};
        sendArray.dividerMessage = "Joined Channel " + ChannelName;
        this.win.webContents.send("TextEventReceiver", sendArray);
        return true;
    }

    buildUserChannelTree() {
        let list = {};
        const channelInfo = {};
        list = this.mumbleConnection.users();
        channelInfo.users = {channels: []};

        for (let key in list) {
            let user = list[key];
            let index = this.channelFind(channelInfo.users.channels, user.channel.name);
            if (index < 0) {
                index = channelInfo.users.channels.push({
                    channelname: user.channel.name,
                    channelid: user.channel.id,
                    users: []
                }) - 1;
            }
            channelInfo.users.channels[index].users.push({username: user.name, userid: user.id});
        }
        return channelInfo;
    }

    MumbleJoinChannelByIdHandler(event, arg) {
        let newChannel = this.mumbleConnection.user.client.channelById(arg);
        try {
            newChannel.join();
            this.showJoinMessage(newChannel.name);
        }
        catch (err) {
            console.log("Failed to join Channel!");
        }
    }

    updateUserChannelTree() {
        let channelInfo = this.buildUserChannelTree();
        this.win.webContents.send("ChannelInfoReceiver", channelInfo);
    }

    buildChannelTree(channel, level, channellist) {
        if (typeof channellist === 'undefined') {
            channellist = [];
        }
        channellist.push({name: channel.name, id: channel.id, usercount: channel.users.length});
        for (let c in channel.children) {
            this.buildChannelTree(channel.children[c], level + 1, channellist);
        }
        return channellist;
    }

    MumbleChannelSearchHandler(event, arg) {
        if (typeof this.channels === 'undefined')
            this.channels = this.buildChannelTree(this.mumbleConnection.rootChannel, 0);
        let options = {
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
        let fuse = new Fuse(this.channels, options); // "list" is the item array
        const result = fuse.search(arg);
        //console.log(result);
        this.win.webContents.send("ChannelSearchReceiver", result);
    }

    channelFind(channelInfo, find) {
        for (const index in channelInfo) {
            if (channelInfo[index].channelname === find) {
                return index;
            }
        }
        return -1;
    }
}
