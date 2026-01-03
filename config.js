const config = {
  twitch: {
    channelName: 'USERNAME', // twitch nickname
    twitchUserId: 'TWITCH_USER_ID', // https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/
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
