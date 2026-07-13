// Place this file at: public/js/group-chat.js
// Used on the Group Chat page for student, teacher, and admin.

let lastMessageTime = window.chatInitialLastTime || null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMessage(msg) {
  const isMine = msg.senderId === window.chatCurrentSenderId && msg.senderRole === window.chatCurrentRole;
  const roleLabel = msg.senderRole.charAt(0).toUpperCase() + msg.senderRole.slice(1);
  const time = new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `margin-bottom:10px; display:flex; flex-direction:column; align-items:${isMine ? 'flex-end' : 'flex-start'};`;
  wrapper.innerHTML = `
    <div style="font-size:0.72rem; color:var(--muted); margin-bottom:2px;">
      ${escapeHtml(msg.senderName)} <span style="opacity:0.7;">(${roleLabel})</span> · ${time}
    </div>
    <div style="max-width:75%; padding:8px 12px; border-radius:10px; background:${isMine ? 'var(--accent, #2e7d5b)' : 'rgba(255,255,255,0.08)'}; color:${isMine ? '#fff' : 'inherit'};">
      ${escapeHtml(msg.message)}
    </div>
  `;
  return wrapper;
}

async function pollGroupChat() {
  try {
    const url = lastMessageTime
      ? `/chat/group/messages?since=${encodeURIComponent(lastMessageTime)}`
      : `/chat/group/messages`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const box = document.getElementById('chat-messages');
    if (!box || !data.messages || data.messages.length === 0) return;

    data.messages.forEach(msg => {
      box.appendChild(renderMessage(msg));
      lastMessageTime = msg.createdAt;
    });
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error('Chat poll error:', err);
  }
}

async function sendGroupMessage(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  try {
    const res = await fetch('/chat/group/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    if (res.ok) {
      input.value = '';
      await pollGroupChat();
    }
  } catch (err) {
    console.error('Send error:', err);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('chat-messages');
  if (box) box.scrollTop = box.scrollHeight;

  const form = document.getElementById('chat-form');
  if (form) form.addEventListener('submit', sendGroupMessage);

  // Poll every 4 seconds for new messages
  setInterval(pollGroupChat, 4000);
});
