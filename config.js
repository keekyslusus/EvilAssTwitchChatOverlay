// https://dev.twitch.tv/console/apps/create
// OAuth redirect: http://localhost:3000
// client type: Confidential
const config = {
  twitch: {
    channelName: 'USERNAME', // twitch nickname
    oauthToken: 'CLIENT_SECRET', //client secret
    twitchUserId: 'TWITCH_USER_ID', // https://www.streamweasels.com/tools/convert-twitch-username-%20to-user-id/
  },
  chat: {
    maxMessages: 5,
    soundVolume: 0.1, // set 0 to mute sound
    soundPath: 'sound/message.mp3',
    ignoreList: ['Moobot', 'Nightbot', 'streamelements'],
  },
  emotes: {
    cacheDurationHours: 1,
    refreshIntervalMinutes: 60,
  },
  style: {
    defaultUsernameColor: '#d6d6d6',
  },
  dev: {
    twitch_debug: false,
  }
};
