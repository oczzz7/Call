import { UA, WebSocketInterface } from 'jssip';

export let sipAgent = null;
export let activeSession = null;

// ფუნქცია: სერვერთან კავშირის დამყარება
export function connectSIP({ wssUrl, extension, password, onRegistered, onFailed, onIncomingCall, onCallUpdate }) {
    try {
        const domain = new URL(wssUrl).hostname;
        const uri = `sip:${extension}@${domain}`;

        const socket = new WebSocketInterface(wssUrl);
        const config = {
            sockets: [socket],
            uri: uri,
            password: password,
            session_timers: false,
            register_expires: 120
        };

        sipAgent = new UA(config);

        // წარმატებული რეგისტრაცია
        sipAgent.on('registered', () => {
            console.log("SIP Registered Successfully!");
            onRegistered();
        });

        // რეგისტრაციის შეცდომა
        sipAgent.on('registrationFailed', (e) => {
            console.error("SIP Registration Failed:", e.cause);
            onFailed(e.cause);
        });

        // ზარის შემოსვლა ან გასვლა
        sipAgent.on('newRTCSession', (data) => {
            const session = data.session;
            activeSession = session;

            if (session.direction === 'incoming') {
                const caller = session.remote_identity.uri.user;
                onIncomingCall(caller);
            }

            // ხმის ნაკადის (Media Stream) მიბმა აუდიო ტეგზე!
            session.on('peerconnection', (e) => {
                e.peerconnection.addEventListener('track', (e) => {
                    const audio = document.getElementById('remoteAudio');
                    if(audio.srcObject !== e.streams[0]) {
                        audio.srcObject = e.streams[0];
                        audio.play().catch(err => console.error("Audio play error:", err));
                    }
                });
            });

            session.on('accepted', () => onCallUpdate('accepted'));
            session.on('ended', () => { activeSession = null; onCallUpdate('ended'); });
            session.on('failed', () => { activeSession = null; onCallUpdate('failed'); });
        });

        sipAgent.start();
    } catch (error) {
        onFailed("არასწორი WSS URL ფორმატი");
    }
}

// ფუნქცია: დარეკვა
export function makeSIPCall(target) {
    if (!sipAgent || !sipAgent.isRegistered()) return false;
    const domain = sipAgent.configuration.uri.host;
    
    const options = {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { rtcpMuxPolicy: 'require' }
    };
    
    sipAgent.call(`sip:${target}@${domain}`, options);
    return true;
}

// ფუნქცია: პასუხი შემომავალ ზარზე
export function answerSIPCall() {
    if (activeSession && activeSession.direction === 'incoming') {
        activeSession.answer({ mediaConstraints: { audio: true, video: false } });
    }
}

// ფუნქცია: ზარის გათიშვა
export function hangupSIPCall() {
    if (activeSession) {
        activeSession.terminate();
    }
}