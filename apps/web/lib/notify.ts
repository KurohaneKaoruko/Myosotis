// ================================================================
// Notifications — the small touches that make a chat app feel alive:
//  * a soft "reply arrived" sound (WebAudio-synthesized, no assets)
//  * a subtle "message sent" tick
//  * desktop notifications for replies landing in the background
//
// Everything degrades silently: no audio context, no permission,
// unsupported API — the feature just doesn't fire.
// ================================================================
import { useStore } from "../store";

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** one soft sine blip; freq/time shape the character of the sound */
function blip(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const ac = audioCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + at);
  g.gain.setValueAtTime(0, ac.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + at);
  osc.stop(ac.currentTime + at + dur + 0.05);
}

/** outgoing message: a very short, quiet tick (WeChat-like) */
export function playSentSound() {
  if (!useStore.getState().settings.soundEnabled) return;
  blip(880, 0, 0.07, 0.05);
}

/** incoming reply: a gentle two-note chime */
export function playReceiveSound() {
  if (!useStore.getState().settings.soundEnabled) return;
  blip(660, 0, 0.16, 0.09);
  blip(990, 0.09, 0.22, 0.07);
}

/**
 * Desktop notification for a reply in a background conversation.
 * Clicking the notification focuses the app (and switches to the
 * conversation via the store, like mainstream chat apps do).
 */
export async function notifyReply(opts: { title: string; body: string; convoId: string }) {
  if (!useStore.getState().settings.desktopNotify) return;
  if (document.hasFocus()) return; // the user is looking at the app already
  try {
    if (Notification.permission === "default") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
    }
    if (Notification.permission !== "granted") return;
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: `myosotis-${opts.convoId}`, // one per conversation, replaces in place
      icon: "logo.png",
    });
    n.onclick = () => {
      window.focus();
      useStore.getState().openConversation(opts.convoId);
      n.close();
    };
  } catch {
    /* notifications unavailable — fine */
  }
}
