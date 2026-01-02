const channelName = config.twitch.channelName;
const oauthToken = config.twitch.oauthToken;
const twitchUserId = config.twitch.twitchUserId;
const maxMessages = config.chat.maxMessages;
const ignoreList = config.chat.ignoreList.map(name => name.toLowerCase());

const newMessageSound = new Audio(config.chat.soundPath);
newMessageSound.volume = config.chat.soundVolume;

function playMessageSound() {
    if (config.chat.soundVolume === 0) return;
    newMessageSound.currentTime = 0;
    newMessageSound.play().catch(() => {});
}

const chatContainer = document.getElementById('chat-container');
let sevenTVEmotes = new Map();
let emoteRefreshInterval = null;

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

function loadEmotesFromCache() {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            const { timestamp, emotes } = JSON.parse(cachedData);
            const isExpired = Date.now() - timestamp >= CACHE_DURATION;
            sevenTVEmotes = new Map(emotes);
            console.log(`loaded ${sevenTVEmotes.size} 7TV emotes from cache${isExpired ? ' (expired)' : ''}`);
            preloadEmoteImages();
            return !isExpired;
        }
    } catch (error) {
        console.error('failed to load emotes from cache:', error);
        localStorage.removeItem(CACHE_KEY);
    }
    return false;
}

async function fetch7TVEmotes() {
    if (loadEmotesFromCache()) {
        return;
    }

    try {
        const response = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const apiData = await response.json();
        if (apiData.emote_set && apiData.emote_set.emotes) {
            const newEmotes = new Map();
            apiData.emote_set.emotes.forEach(emote => {
                const emoteData = emote.data;
                if (!emoteData) return;
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
                searchIndex = wordStart + word.length;
            }
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
            img.src = emote.urls['1x'] || emote.urls['2x'] || emote.urls['3x'] || '';
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

function getElementPositions() {
    const positions = new Map();
    for (const child of chatContainer.children) {
        positions.set(child, child.getBoundingClientRect().top);
    }
    return positions;
}

function animateMessages(oldPositions, newElement, removingElement) {
    for (const child of chatContainer.children) {
        if (child === newElement) continue;

        const oldTop = oldPositions.get(child);
        if (oldTop === undefined) continue;

        const newTop = child.getBoundingClientRect().top;
        const deltaY = oldTop - newTop;

        if (child === removingElement) {
            child.style.transition = 'none';
            child.style.transform = `translateY(${deltaY}px)`;
            child.style.opacity = '1';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    child.style.transition = '';
                    child.style.transform = 'translateY(-40px)';
                    child.style.opacity = '0';
                });
            });
        } else if (Math.abs(deltaY) > 0.5) {
            child.style.transition = 'none';
            child.style.transform = `translateY(${deltaY}px)`;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    child.style.transition = '';
                    child.style.transform = '';
                });
            });
        }
    }
}

function isValidColor(color) {
    return color && /^#[0-9A-Fa-f]{3,6}$/.test(color);
}

function addMessage(displayName, color, message, emotes) {
    const oldPositions = getElementPositions();

    let removingElement = null;
    if (chatContainer.children.length >= maxMessages) {
        removingElement = chatContainer.firstChild;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', 'entering');

    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('username');
    usernameSpan.style.color = isValidColor(color) ? color : config.style.defaultUsernameColor;
    usernameSpan.textContent = displayName;
    messageElement.appendChild(usernameSpan);

    const messageContent = document.createElement('span');
    messageContent.appendChild(document.createTextNode(': '));
    messageContent.appendChild(parseMessageWithEmotes(message, emotes));
    messageElement.appendChild(messageContent);

    chatContainer.appendChild(messageElement);

    if (removingElement) {
        setTimeout(() => {
            if (removingElement.parentNode) {
                removingElement.remove();
            }
        }, 400);
    }

    animateMessages(oldPositions, messageElement, removingElement);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            messageElement.classList.remove('entering');
        });
    });
}

client.on('message', (channel, tags, message, self) => {
    if (self) return;
    if (!message || !message.trim()) return;

    const displayName = tags['display-name'] || tags.username || 'Anonymous';
    if (ignoreList.includes(displayName.toLowerCase())) {
        return;
    }

    playMessageSound();
    addMessage(displayName, tags.color, message, tags.emotes);
});

client.on('connected', (address, port) => {
    console.log(`connected to Twitch: ${address}:${port}`);
    if (!emoteRefreshInterval) {
        emoteRefreshInterval = setInterval(fetch7TVEmotes, config.emotes.refreshIntervalMinutes * 60 * 1000);
    }
});

client.on('disconnected', (reason) => {
    console.log('disconnected from Twitch:', reason);
    if (emoteRefreshInterval) {
        clearInterval(emoteRefreshInterval);
        emoteRefreshInterval = null;
    }
});

initialize();