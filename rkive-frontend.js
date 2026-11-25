/**
 * RKIVE Frontend Integration Library
 * Add this script to all your HTML pages:
 *   <script src="http://localhost:3000/rkive-frontend.js"></script>
 *
 * Features:
 * - Anonymous sign-in (a private token is kept in this browser's localStorage)
 * - Mood tracking
 * - Room management
 * - Robin AI chat (with India crisis helplines)
 * - Konekt social matching
 *
 * Every request sends "Authorization: Bearer <token>". The server decides who
 * you are from the token, so one user can no longer read another's data.
 */

/** Makes text safe to put inside innerHTML (stops script injection / XSS). */
function rkiveEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow simple #rrggbb colours inside style attributes. */
function rkiveColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#4A90D9';
}

const RKIVE_HELPLINES = [
  { name: 'Tele-MANAS (Govt. of India)', number: '14416', alt: '1-800-891-4416', hours: '24x7 · Free · Many Indian languages' },
  { name: 'iCALL (TISS)', number: '9152987821', hours: 'Mon–Sat, 10 AM – 8 PM' },
  { name: 'Emergency services', number: '112', hours: '24x7 · If you are in immediate danger' },
];

const RkiveAPI = {
  baseURL: window.RKIVE_API_URL || 'http://localhost:3000',
  currentUser: null,

  // ============ HTTP HELPER ============
  token() {
    return localStorage.getItem('rkive_token');
  },

  async api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({ success: false, error: 'Bad response' }));
    if (response.status === 401) {
      localStorage.removeItem('rkive_token');
      this.currentUser = null;
    }
    if (!result.success) throw new Error(result.error || `Request failed (${response.status})`);
    return result.data;
  },

  // ============ INITIALIZATION ============
  async init() {
    this.injectStyles();
    localStorage.removeItem('rkive_userId'); // old, insecure key from earlier versions

    if (this.token()) {
      try {
        this.currentUser = await this.api('/api/me');
        return;
      } catch (err) {
        console.warn('Saved session is no longer valid:', err.message);
      }
    }
    await this.showUserSwitchModal();
  },

  /** Sign-in screen: create an anonymous account (or pick a demo user in DEMO_MODE). */
  async showUserSwitchModal() {
    document.getElementById('rkive-user-switch-modal')?.remove();

    let demoUsers = [];
    try {
      demoUsers = await this.api('/api/demo/users');
    } catch {
      /* demo mode is off - that's normal */
    }

    const modal = document.createElement('div');
    modal.id = 'rkive-user-switch-modal';
    modal.innerHTML = `
      <div class="rkive-modal-overlay">
        <div class="rkive-modal">
          <h2>Welcome to Rkive</h2>
          <p>Pick an anonymous handle. No email or real name needed.</p>
          <div class="rkive-signup">
            <input type="text" id="rkive-handle-input" maxlength="20" placeholder="e.g. QuietRiver_7 (optional)" />
            <button id="rkive-signup-btn">Continue</button>
          </div>
          <p id="rkive-signup-error" class="rkive-error" style="display:none;"></p>
          ${
            demoUsers.length
              ? `<p style="margin-top:16px">Or use a demo account:</p>
                 <div class="rkive-user-list">
                   ${demoUsers
                     .map(
                       (user) => `
                     <button class="rkive-user-btn" data-user-id="${rkiveEscape(user.id)}">
                       <div class="rkive-avatar" style="background-color: ${rkiveColor(user.color)}">${rkiveEscape(user.avatar)}</div>
                       <span>${rkiveEscape(user.handle)}</span>
                     </button>`,
                     )
                     .join('')}
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#rkive-signup-error');
    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };

    modal.querySelector('#rkive-signup-btn').addEventListener('click', async () => {
      const handle = modal.querySelector('#rkive-handle-input').value.trim();
      try {
        const data = await this.api('/api/auth/signup', {
          method: 'POST',
          body: handle ? { handle } : {},
        });
        this.signedIn(data);
        modal.remove();
      } catch (err) {
        showError(err.message);
      }
    });

    modal.querySelectorAll('.rkive-user-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        try {
          const data = await this.api('/api/demo/login', {
            method: 'POST',
            body: { userId: e.currentTarget.dataset.userId },
          });
          this.signedIn(data);
          modal.remove();
        } catch (err) {
          showError(err.message);
        }
      });
    });
  },

  signedIn({ user, token }) {
    localStorage.setItem('rkive_token', token);
    this.currentUser = user;
    console.log('Signed in as', user.handle);
  },

  async logout() {
    try {
      await this.api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* already signed out */
    }
    localStorage.removeItem('rkive_token');
    this.currentUser = null;
  },

  requireUser() {
    if (this.currentUser) return true;
    this.showUserSwitchModal();
    return false;
  },

  // ============ MOOD TRACKING ============
  async logMood(score, note = '') {
    if (!this.requireUser()) return null;
    try {
      const data = await this.api('/api/moods/log', { method: 'POST', body: { score, note } });
      console.log('Mood logged:', score);
      return data;
    } catch (err) {
      console.error('Error logging mood:', err);
      return null;
    }
  },

  async getMoodHistory() {
    if (!this.currentUser) return [];
    try {
      return await this.api(`/api/moods/${encodeURIComponent(this.currentUser.id)}`);
    } catch (err) {
      console.error('Error fetching moods:', err);
      return [];
    }
  },

  async getMoodAverage() {
    if (!this.currentUser) return 0;
    try {
      const data = await this.api(`/api/moods/${encodeURIComponent(this.currentUser.id)}/average`);
      return data.average || 0;
    } catch (err) {
      console.error('Error fetching mood average:', err);
      return 0;
    }
  },

  // ============ ROOMS ============
  async createRoom(title, type = 'reflection') {
    if (!this.requireUser()) return null;
    try {
      const data = await this.api('/api/rooms/create', { method: 'POST', body: { title, type } });
      console.log('Room created:', title);
      return data;
    } catch (err) {
      console.error('Error creating room:', err);
      return null;
    }
  },

  async getRooms() {
    if (!this.currentUser) return [];
    try {
      return await this.api(`/api/rooms/${encodeURIComponent(this.currentUser.id)}`);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      return [];
    }
  },

  async getRoomEntries(roomId) {
    if (!this.currentUser) return [];
    try {
      return await this.api(`/api/rooms/${encodeURIComponent(roomId)}/entries`);
    } catch (err) {
      console.error('Error fetching room entries:', err);
      return [];
    }
  },

  async addRoomEntry(roomId, type, content) {
    if (!this.currentUser) return null;
    try {
      return await this.api(`/api/rooms/${encodeURIComponent(roomId)}/entries`, {
        method: 'POST',
        body: { type, content },
      });
    } catch (err) {
      console.error('Error adding room entry:', err);
      return null;
    }
  },

  // ============ ROBIN AI CHAT ============
  /**
   * Sends a message to Robin. The SERVER does the crisis check (so it works
   * even if this script is old), and the reply always includes helplines when
   * needed. We no longer redirect away - the person stays in the conversation.
   */
  async chatWithRobin(roomId, message) {
    if (!this.requireUser()) return null;
    try {
      const data = await this.api('/api/robin/chat', { method: 'POST', body: { roomId, message } });
      if (data.isCrisis) this.showCrisisHelp();
      return data;
    } catch (err) {
      console.error('Error chatting with Robin:', err);
      return null;
    }
  },

  showRobinChatModal(roomId, roomTitle) {
    const modal = document.createElement('div');
    modal.id = 'rkive-robin-modal';
    modal.innerHTML = `
      <div class="rkive-modal-overlay">
        <div class="rkive-modal rkive-chat-modal">
          <div class="rkive-chat-header">
            <h3>Robin - ${rkiveEscape(roomTitle)}</h3>
            <button class="rkive-close-btn">&times;</button>
          </div>
          <div class="rkive-chat-messages" id="robin-messages"></div>
          <div class="rkive-chat-input">
            <input type="text" id="robin-input" maxlength="2000" placeholder="Talk to Robin..." />
            <button id="robin-send-btn">Send</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const messagesDiv = modal.querySelector('#robin-messages');
    const input = modal.querySelector('#robin-input');
    const sendBtn = modal.querySelector('#robin-send-btn');

    const addMessage = (text, cls) => {
      const el = document.createElement('div');
      el.className = `rkive-message ${cls}`;
      el.textContent = text; // textContent never runs HTML
      messagesDiv.appendChild(el);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    const handleSend = async () => {
      const message = input.value.trim();
      if (!message) return;
      addMessage(message, 'user-message');
      input.value = '';
      sendBtn.disabled = true;
      const response = await this.chatWithRobin(roomId, message);
      sendBtn.disabled = false;
      addMessage(
        response ? response.reply : "Couldn't reach Robin. Please check your connection and try again.",
        'robin-message',
      );
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
    modal.querySelector('.rkive-close-btn').addEventListener('click', () => modal.remove());
    input.focus();
  },

  // ============ KONEKT SOCIAL ============
  async getMatches() {
    if (!this.currentUser) return [];
    try {
      return await this.api('/api/konekt/matches');
    } catch (err) {
      console.error('Error fetching matches:', err);
      return [];
    }
  },

  async sendKonektMessage(partnerId, content) {
    if (!this.currentUser) return null;
    try {
      return await this.api('/api/konekt/chat/send', { method: 'POST', body: { partnerId, content } });
    } catch (err) {
      console.error('Error sending Konekt message:', err);
      return null;
    }
  },

  async getKonektChat(partnerId) {
    try {
      return await this.api(`/api/konekt/chat/with/${encodeURIComponent(partnerId)}`);
    } catch (err) {
      console.error('Error fetching Konekt chat:', err);
      return [];
    }
  },

  showKonektModal() {
    if (!this.requireUser()) return;
    const modal = document.createElement('div');
    modal.id = 'rkive-konekt-modal';
    modal.innerHTML = `
      <div class="rkive-modal-overlay">
        <div class="rkive-modal rkive-konekt-modal">
          <div class="rkive-modal-header">
            <h3>Konekt - Find Matches</h3>
            <button class="rkive-close-btn">&times;</button>
          </div>
          <div id="konekt-matches" class="rkive-matches-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const matchesDiv = modal.querySelector('#konekt-matches');
    this.getMatches().then((matches) => {
      matchesDiv.innerHTML = matches
        .map(
          (match) => `
        <div class="rkive-match-card" style="border-left: 4px solid ${rkiveColor(match.color)}">
          <div class="rkive-avatar" style="background-color: ${rkiveColor(match.color)}">${rkiveEscape(match.avatar)}</div>
          <h4>${rkiveEscape(match.handle)}</h4>
          <button class="rkive-match-btn" data-match-id="${rkiveEscape(match.id)}" data-match-handle="${rkiveEscape(match.handle)}">Start Chat</button>
        </div>`,
        )
        .join('');

      matchesDiv.querySelectorAll('.rkive-match-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const { matchId, matchHandle } = e.currentTarget.dataset;
          this.showKonektChatModal(matchId, matchHandle);
        });
      });
    });

    modal.querySelector('.rkive-close-btn').addEventListener('click', () => modal.remove());
  },

  showKonektChatModal(partnerId, partnerHandle = '') {
    const modal = document.createElement('div');
    modal.id = 'rkive-konekt-chat-modal';
    modal.innerHTML = `
      <div class="rkive-modal-overlay">
        <div class="rkive-modal rkive-chat-modal">
          <div class="rkive-chat-header">
            <h3>Konekt Chat ${partnerHandle ? `with ${rkiveEscape(partnerHandle)}` : ''}</h3>
            <button class="rkive-close-btn">&times;</button>
          </div>
          <div class="rkive-chat-messages" id="konekt-messages"></div>
          <div class="rkive-chat-input">
            <input type="text" id="konekt-input" maxlength="2000" placeholder="Send a message..." />
            <button id="konekt-send-btn">Send</button>
          </div>
          <div id="konekt-warning" class="rkive-warning-banner" style="display:none;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const messagesDiv = modal.querySelector('#konekt-messages');
    const input = modal.querySelector('#konekt-input');
    const warningDiv = modal.querySelector('#konekt-warning');

    // Builds a message bubble with textContent only - other users' text is never run as HTML.
    const addMessage = (sender, text, mine) => {
      const el = document.createElement('div');
      el.className = `rkive-message ${mine ? 'user-message' : 'other-message'}`;
      const name = document.createElement('strong');
      name.textContent = `${sender}: `;
      el.appendChild(name);
      el.appendChild(document.createTextNode(text));
      messagesDiv.appendChild(el);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    this.getKonektChat(partnerId).then((messages) => {
      messages.forEach((msg) =>
        addMessage(msg.senderHandle, msg.content, msg.senderHandle === this.currentUser.handle),
      );
    });

    const handleSend = async () => {
      const message = input.value.trim();
      if (!message) return;
      const msgData = await this.sendKonektMessage(partnerId, message);
      if (msgData) {
        addMessage(this.currentUser.handle, message, true);
        if (msgData.isFlagged && msgData.warning) {
          warningDiv.textContent = `⚠️ ${msgData.warning}`;
          warningDiv.style.display = 'block';
        }
        input.value = '';
      }
    };

    modal.querySelector('#konekt-send-btn').addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
    modal.querySelector('.rkive-close-btn').addEventListener('click', () => modal.remove());
    input.focus();
  },

  // ============ CRISIS HELP ============
  showCrisisHelp() {
    if (document.getElementById('rkive-crisis-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'rkive-crisis-overlay';
    overlay.className = 'rkive-crisis-overlay';
    overlay.innerHTML = `
      <div class="rkive-crisis-container">
        <div class="rkive-crisis-content" role="dialog" aria-labelledby="rkive-crisis-title">
          <h2 id="rkive-crisis-title">You don't have to face this alone</h2>
          <p>Talking to someone right now can help. These services are free and confidential:</p>
          ${RKIVE_HELPLINES.map(
            (h) => `
            <div class="rkive-crisis-resource">
              <h3>${h.name}</h3>
              <p><strong><a href="tel:${h.number}">Call ${h.number}</a></strong>${h.alt ? ` or <a href="tel:${h.alt.replace(/-/g, '')}">${h.alt}</a>` : ''}</p>
              <p>${h.hours}</p>
            </div>`,
          ).join('')}
          <p>If you can, tell someone you trust nearby how you're feeling. Robin is still here to talk.</p>
          <button id="close-crisis-btn" class="rkive-close-crisis-btn">Back to the chat</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#close-crisis-btn').addEventListener('click', () => overlay.remove());
  },

  // ============ UI HELPERS ============
  injectStyles() {
    if (document.getElementById('rkive-styles')) return;

    const style = document.createElement('style');
    style.id = 'rkive-styles';
    style.textContent = `
      /* Modals */
      .rkive-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .rkive-modal {
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }

      .rkive-modal h2 {
        margin-top: 0;
        color: #333;
      }

      .rkive-modal h3 {
        color: #4A90D9;
      }

      /* User Switch */
      .rkive-user-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .rkive-user-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 12px;
      }

      .rkive-user-btn:hover {
        border-color: #4A90D9;
        background: #f5f9ff;
      }

      .rkive-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 16px;
      }

      /* Chat Modal */
      .rkive-chat-modal {
        display: flex;
        flex-direction: column;
        max-width: 600px;
        max-height: 600px;
      }

      .rkive-modal-header,
      .rkive-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #eee;
      }

      .rkive-close-btn {
        background: none;
        border: none;
        font-size: 28px;
        cursor: pointer;
        color: #999;
      }

      .rkive-close-btn:hover {
        color: #333;
      }

      .rkive-chat-messages {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 12px;
        padding: 12px;
        background: #f9f9f9;
        border-radius: 8px;
      }

      .rkive-message {
        margin-bottom: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        word-wrap: break-word;
      }

      .user-message {
        background: #4A90D9;
        color: white;
        margin-left: 24px;
        text-align: right;
      }

      .robin-message,
      .other-message {
        background: white;
        color: #333;
        margin-right: 24px;
        border: 1px solid #eee;
      }

      .rkive-chat-input {
        display: flex;
        gap: 8px;
      }

      .rkive-chat-input input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
      }

      .rkive-chat-input button {
        padding: 10px 16px;
        background: #4A90D9;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      }

      .rkive-chat-input button:hover {
        background: #357abc;
      }

      /* Crisis */
      .rkive-crisis-alert {
        background: #fee;
        border: 1px solid #f99;
        color: #c33;
        padding: 12px;
        border-radius: 6px;
        margin-top: 12px;
      }

      .rkive-crisis-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      }

      .rkive-crisis-container {
        background: white;
        border-radius: 12px;
        padding: 32px;
        max-width: 600px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }

      .rkive-crisis-content h2 {
        color: #c33;
        margin-top: 0;
      }

      .rkive-crisis-resource {
        background: #f0f8ff;
        border-left: 4px solid #4A90D9;
        padding: 16px;
        margin: 16px 0;
        border-radius: 6px;
      }

      .rkive-crisis-resource h3 {
        margin: 0 0 8px 0;
        color: #333;
      }

      .rkive-crisis-resource p {
        margin: 4px 0;
        color: #666;
      }

      .rkive-close-crisis-btn {
        width: 100%;
        padding: 12px;
        background: #4A90D9;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin-top: 16px;
      }

      /* Sign-in */
      .rkive-signup { display: flex; gap: 8px; margin-top: 12px; }
      .rkive-signup input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
      .rkive-signup button { padding: 10px 16px; background: #4A90D9; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
      .rkive-error { color: #c0392b; margin-top: 8px; }
      .rkive-crisis-resource a { color: #2c6fbb; }

      /* Konekt */
      .rkive-konekt-modal {
        max-width: 800px;
      }

      .rkive-matches-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 16px;
      }

      .rkive-match-card {
        background: #f9f9f9;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
      }

      .rkive-match-card h4 {
        margin: 12px 0 8px;
        color: #333;
        font-size: 14px;
      }

      .rkive-match-btn {
        width: 100%;
        padding: 8px;
        background: #50C878;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      }

      .rkive-match-btn:hover {
        background: #3da35f;
      }

      .rkive-warning-banner {
        background: #fffacd;
        border: 1px solid #f0e68c;
        color: #666;
        padding: 12px;
        border-radius: 6px;
        margin-top: 12px;
      }
    `;

    document.head.appendChild(style);
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RkiveAPI.init());
} else {
  RkiveAPI.init();
}
