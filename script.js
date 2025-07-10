const channelName = config.twitch.channelName;
const oauthToken = config.twitch.oauthToken;
const twitchUserId = config.twitch.twitchUserId;
const maxMessages = config.chat.maxMessages;
const ignoreList = config.chat.ignoreList.map(name => name.toLowerCase());

const newMessageSound = new Audio(config.chat.soundPath);
newMessageSound.volume = config.chat.soundVolume;

const chatContainer = document.getElementById('chat-container');
let sevenTVEmotes = new Map();

const CACHE_KEY = '7tv_emotes_cache';
const CACHE_DURATION = config.emotes.cacheDurationHours * 60 * 60 * 1000;

function preloadEmoteImages() {
    console.log(`pre-loading ${sevenTVEmotes.size} emote images...`);
    for (const emote of sevenTVEmotes.values()) {
        if (emote.urls && emote.urls['1x']) {
            const img = new Image();
            img.src = emote.urls['1x'];
        }
    }
    console.log('emote image pre-loading initiated.');
}

async function fetch7TVEmotes() {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
        const { timestamp, emotes } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION) {
            sevenTVEmotes = new Map(emotes);
            console.log(`loaded ${sevenTVEmotes.size} 7TV emotes from cache`);
            preloadEmoteImages();
            return;
        }
    }

    try {
        const response = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        const apiData = await response.json();
        if (apiData.emote_set && apiData.emote_set.emotes) {
            const newEmotes = new Map();
            apiData.emote_set.emotes.forEach(emote => {
                const emoteData = emote.data;
                const host = emoteData.host;
                
                const urls = {};
                if (host && host.files) {
                    host.files.forEach(file => {
                        if (file.name.endsWith('.webp')) {
                            const size = file.name.replace('.webp', '');
                            urls[size] = `https:${host.url}/${file.name}`;
                        }
                    });
                }
                
                newEmotes.set(emoteData.name, {
                    id: emoteData.id,
                    name: emoteData.name,
                    animated: emoteData.animated,
                    urls: urls
                });
            });

            sevenTVEmotes = newEmotes;
            const cachePayload = {
                timestamp: Date.now(),
                emotes: Array.from(sevenTVEmotes.entries())
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
            console.log(`loaded ${sevenTVEmotes.size} 7TV emotes from API and cached`);
            preloadEmoteImages();
        }
    } catch (error) {
        console.error('failed to fetch 7TV emotes:', error);
    }
}

function parseMessageWithEmotes(message, twitchEmotes) {
    const fragment = new DocumentFragment();
    const emotePositions = [];
    if (twitchEmotes) {
        for (const id in twitchEmotes) {
            for (const range of twitchEmotes[id]) {
                const [start, end] = range.split('-').map(Number);
                emotePositions.push({ 
                    id, 
                    start, 
                    end, 
                    type: 'twitch',
                    name: message.substring(start, end + 1)
                });
            }
        }
    }
    
    const words = message.split(/\s+/);
    let searchIndex = 0;
    for (const word of words) {
        if (sevenTVEmotes.has(word)) {
            const wordStart = message.indexOf(word, searchIndex);
            const wordEnd = wordStart + word.length - 1;
            const isOccupied = emotePositions.some(pos => 
                (wordStart >= pos.start && wordStart <= pos.end) ||
                (wordEnd >= pos.start && wordEnd <= pos.end)
            );
            
            if (!isOccupied && wordStart !== -1) {
                const emote = sevenTVEmotes.get(word);
                emotePositions.push({
                    id: emote.id,
                    start: wordStart,
                    end: wordEnd,
                    type: '7tv',
                    name: word,
                    urls: emote.urls
                });
            }
            
            searchIndex = wordStart + word.length;
        } else {
            const wordStart = message.indexOf(word, searchIndex);
            if (wordStart !== -1) {
                searchIndex = wordStart + word.length;
            }
        }
    }
    
    emotePositions.sort((a, b) => a.start - b.start);
    let lastIndex = 0;
    for (const emote of emotePositions) {
        if (emote.start > lastIndex) {
            fragment.appendChild(document.createTextNode(message.substring(lastIndex, emote.start)));
        }
        
        const img = document.createElement('img');
        img.classList.add('chat-emote');
        img.alt = emote.name;
        
        if (emote.type === 'twitch') {
            img.src = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
        } else if (emote.type === '7tv') {
            img.src = emote.urls['1x'] || emote.urls['1x'];
        }
        
        fragment.appendChild(img);
        lastIndex = emote.end + 1;
    }
    
    if (lastIndex < message.length) {
        fragment.appendChild(document.createTextNode(message.substring(lastIndex)));
    }
    
    return fragment;
}

const client = new tmi.Client({
    options: { debug: config.dev.twitch_debug },
    identity: { username: 'justinfan123', password: `oauth:${oauthToken}` },
    channels: [ channelName ]
});

function initialize() {
    client.connect().catch(console.error);
    fetch7TVEmotes();
}

client.on('message', (channel, tags, message, self) => {
    if (self) return;

    if (ignoreList.includes(tags['display-name'].toLowerCase())) {
        return;
    }

    newMessageSound.play().catch(error => {
        console.error("could not play sound:", error);
    });

    if (chatContainer.children.length >= maxMessages) {
        const oldestMessage = chatContainer.firstChild;
        oldestMessage.classList.add('disappearing-message');
        oldestMessage.addEventListener('animationend', () => oldestMessage.remove(), { once: true });
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', 'new-message-animation');

    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('username');
    usernameSpan.style.color = tags['color'] || config.style.defaultUsernameColor;
    usernameSpan.textContent = tags['display-name'];
    messageElement.appendChild(usernameSpan);

    const messageContent = document.createElement('span');
    messageContent.appendChild(document.createTextNode(': ')); 
    messageContent.appendChild(parseMessageWithEmotes(message, tags.emotes));
    messageElement.appendChild(messageContent);

    chatContainer.appendChild(messageElement);

    messageElement.addEventListener('animationend', () => {
        messageElement.classList.remove('new-message-animation');
    }, { once: true });
});

// refresh 7TV emotes
setInterval(fetch7TVEmotes, config.emotes.refreshIntervalMinutes * 60 * 1000);

initialize();