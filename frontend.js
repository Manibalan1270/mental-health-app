/**
 * RKIVE Frontend Integration Library
 * Add this script to all your HTML pages
 * 
 * Features:
 * - User session management
 * - Mood tracking
 * - Room management
 * - Robin AI chat
 * - Konekt social matching
 */

const RkiveAPI = {
  baseURL: 'http://localhost:3000',
  currentUser: null,

  // ============ INITIALIZATION ============
  async init() {
    // Load user from localStorage or show modal
    const savedUserId = localStorage.getItem('rkive_userId');

    if (savedUserId) {
      await this.setCurrentUser(savedUserId);
    } else {
      await this.showUserSwitchModal();
    }

    // Inject global styles
    this.injectStyles();
  },

  async showUserSwitchModal() {
    try {
      const response = await fetch(`${this.baseURL}/api/users`);
      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      const users = result.data;

      // Create modal
      const modal = document.createElement('div');
      modal.id = 'rkive-user-switch-modal';
      modal.innerHTML = `
        <div class="rkive-modal-overlay">
          <div class="rkive-modal">
            <h2>Welcome to Rkive</h2>
            <p>Select your account</p>
            <div class="rkive-user-list">
              ${users.map(user => `
                <button class="rkive-user-btn" data-user-id="${user.id}">
                  <div class="rkive-avatar" style="background-color: ${user.color}">
                    ${user.avatar}
                  </div>
                  <span>${user.handle}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Add event listeners
      document.querySelectorAll('.rkive-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const userId = e.currentTarget.dataset.userId;
          await this.setCurrentUser(userId);
          modal.remove();
        });
      });

    } catch (err) {
      console.error('Error loading users:', err);
    }
  },

  async setCurrentUser(userId) {
    try {
      const response = await fetch(`${this.baseURL}/api/users/current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const result = await response.json();
      if (result.success) {
        this.currentUser = result.data;
        localStorage.setItem('rkive_userId', userId);
        console.log('User set:', this.currentUser.handle);
      }
    } catch (err) {
      console.error('Error setting user:', err);
    }
  },

  // ============ MOOD TRACKING ============
  async logMood(score, note = '') {
    if (!this.currentUser) {
      alert('Please select a user first');
      return null;
    }

    try {
      const response = await fetch(`${this.baseURL}/api/moods/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          score,
          note
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('Mood logged:', score);
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error logging mood:', err);
      return null;
    }
  },

  async getMoodHistory(userId = null) {
    const id = userId || this.currentUser?.id;
    if (!id) return [];

    try {
      const response = await fetch(`${this.baseURL}/api/moods/${id}`);
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (err) {
      console.error('Error fetching moods:', err);
      return [];
    }
  },

  async getMoodAverage(userId = null) {
    const id = userId || this.currentUser?.id;
    if (!id) return 0;

    try {
      const response = await fetch(`${this.baseURL}/api/moods/${id}/average`);
      const result = await response.json();
      return result.success ? result.data.average : 0;
    } catch (err) {
      console.error('Error fetching mood average:', err);
      return 0;
    }
  },

  // ============ ROOMS ============
  async createRoom(title, type = 'reflection') {
    if (!this.currentUser) {
      alert('Please select a user first');
      return null;
    }

    try {
      const response = await fetch(`${this.baseURL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          title,
          type
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('Room created:', title);
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error creating room:', err);
      return null;
    }
  },

  async getRooms(userId = null) {
    const id = userId || this.currentUser?.id;
    if (!id) return [];

    try {
      const response = await fetch(`${this.baseURL}/api/rooms/${id}`);
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (err) {
      console.error('Error fetching rooms:', err);
      return [];
    }
  },

  async getRoomEntries(roomId) {
    if (!this.currentUser) return [];

    try {
      const response = await fetch(
        `${this.baseURL}/api/rooms/${roomId}/entries?userId=${this.currentUser.id}`
      );
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (err) {
      console.error('Error fetching room entries:', err);
      return [];
    }
  },

  async addRoomEntry(roomId, type, content) {
    if (!this.currentUser) return null;

    try {
      const response = await fetch(`${this.baseURL}/api/rooms/${roomId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          type,
          content,
          userId: this.currentUser.id
        })
      });

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (err) {
      console.error('Error adding room entry:', err);
      return null;
    }
  },

  // ============ ROBIN AI CHAT ============
  async chatWithRobin(roomId, message) {
    // Client-side sensitive keyword check
    const sensitiveKeywords = [
      'suicide', 'kill myself', 'end my life', 'want to die', 'self harm',
      'cutting myself', 'jump off', 'hang myself', 'overdose'
    ];
    const lowerMessage = message.toLowerCase();
    if (sensitiveKeywords.some(keyword => lowerMessage.includes(keyword))) {
      window.location.href = 'https://988lifeline.org/';
      return;
    }

    if (!this.currentUser) {
      alert('Please select a user first using the account icon!');
      this.showUserSwitchModal();
      return null;
    }

    try {
      const response = await fetch(`${this.baseURL}/api/robin/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          message,
          userId: this.currentUser.id
        })
      });

      const result = await response.json();
      if (result.success) {
        // Global safety trigger: If crisis is detected, show help modal automatically
        if (result.data.isCrisis) {
          window.location.href = 'https://988lifeline.org/';
        }
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error chatting with Robin:', err);
      alert('Robin is having trouble speaking right now. Please check if your server is running.');
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
            <h3>Robin - ${roomTitle}</h3>
            <button class="rkive-close-btn">&times;</button>
          </div>
          <div class="rkive-chat-messages" id="robin-messages"></div>
          <div class="rkive-chat-input">
            <input type="text" id="robin-input" placeholder="Talk to Robin..." />
            <button id="robin-send-btn">Send</button>
          </div>
          <div id="robin-crisis-alert" class="rkive-crisis-alert" style="display:none;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const messagesDiv = document.getElementById('robin-messages');
    const input = document.getElementById('robin-input');
    const sendBtn = document.getElementById('robin-send-btn');
    const crisisAlert = document.getElementById('robin-crisis-alert');
    const closeBtn = modal.querySelector('.rkive-close-btn');

    // Send message handler
    const handleSend = async () => {
      const message = input.value.trim();
      if (!message) return;

      // Add user message to chat
      const userMsg = document.createElement('div');
      userMsg.className = 'rkive-message user-message';
      userMsg.textContent = message;
      messagesDiv.appendChild(userMsg);

      input.value = '';

      // Get Robin response
      const response = await this.chatWithRobin(roomId, message);

      if (response) {
        // Handle crisis: redirect to 988 Lifeline
        if (response.isCrisis) {
          modal.remove(); // Close the chat modal
          window.location.href = 'https://988lifeline.org/';
          return;
        }

        // Add Robin message to chat
        const robinMsg = document.createElement('div');
        robinMsg.className = 'rkive-message robin-message';
        robinMsg.textContent = response.reply;
        messagesDiv.appendChild(robinMsg);

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });

    closeBtn.addEventListener('click', () => {
      modal.remove();
    });

    input.focus();
  },

  // ============ KONEKT SOCIAL ============
  async getMatches() {
    if (!this.currentUser) return [];

    try {
      const response = await fetch(
        `${this.baseURL}/api/konekt/matches?userId=${this.currentUser.id}`
      );
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (err) {
      console.error('Error fetching matches:', err);
      return [];
    }
  },

  async sendKonektMessage(chatRoomId, content) {
    if (!this.currentUser) return null;

    try {
      const response = await fetch(`${this.baseURL}/api/konekt/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatRoomId,
          senderHandle: this.currentUser.handle,
          content
        })
      });

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (err) {
      console.error('Error sending Konekt message:', err);
      return null;
    }
  },

  async getKonektChat(chatRoomId) {
    try {
      const response = await fetch(`${this.baseURL}/api/konekt/chat/${chatRoomId}`);
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (err) {
      console.error('Error fetching Konekt chat:', err);
      return [];
    }
  },

  showKonektModal() {
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

    const matchesDiv = document.getElementById('konekt-matches');
    const closeBtn = modal.querySelector('.rkive-close-btn');

    // Load matches
    this.getMatches().then(matches => {
      matchesDiv.innerHTML = matches.map(match => `
        <div class="rkive-match-card" style="border-left: 4px solid ${match.color}">
          <div class="rkive-avatar" style="background-color: ${match.color}">
            ${match.avatar}
          </div>
          <h4>${match.handle}</h4>
          <button class="rkive-match-btn" data-match-id="${match.id}">
            Start Chat
          </button>
        </div>
      `).join('');

      // Add click handlers
      document.querySelectorAll('.rkive-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const matchId = e.currentTarget.dataset.matchId;
          const chatRoomId = `konekt_${this.currentUser.id}_${matchId}`;
          this.showKonektChatModal(chatRoomId, matchId);
        });
      });
    });

    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  },

  showKonektChatModal(chatRoomId, matchUserId) {
    const modal = document.createElement('div');
    modal.id = 'rkive-konekt-chat-modal';
    modal.innerHTML = `
      <div class="rkive-modal-overlay">
        <div class="rkive-modal rkive-chat-modal">
          <div class="rkive-chat-header">
            <h3>Konekt Chat</h3>
            <button class="rkive-close-btn">&times;</button>
          </div>
          <div class="rkive-chat-messages" id="konekt-messages"></div>
          <div class="rkive-chat-input">
            <input type="text" id="konekt-input" placeholder="Send a message..." />
            <button id="konekt-send-btn">Send</button>
          </div>
          <div id="konekt-warning" class="rkive-warning-banner" style="display:none;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const messagesDiv = document.getElementById('konekt-messages');
    const input = document.getElementById('konekt-input');
    const sendBtn = document.getElementById('konekt-send-btn');
    const warningDiv = document.getElementById('konekt-warning');
    const closeBtn = modal.querySelector('.rkive-close-btn');

    // Load existing messages
    this.getKonektChat(chatRoomId).then(messages => {
      messages.forEach(msg => {
        const msgEl = document.createElement('div');
        msgEl.className = `rkive-message ${msg.senderHandle === this.currentUser.handle ? 'user-message' : 'other-message'}`;
        msgEl.innerHTML = `<strong>${msg.senderHandle}:</strong> ${msg.content}`;
        messagesDiv.appendChild(msgEl);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    // Send handler
    const handleSend = async () => {
      const message = input.value.trim();
      if (!message) return;

      const msgData = await this.sendKonektMessage(chatRoomId, message);

      if (msgData) {
        const msgEl = document.createElement('div');
        msgEl.className = 'rkive-message user-message';
        msgEl.textContent = message;
        messagesDiv.appendChild(msgEl);

        if (msgData.isFlagged && msgData.warning) {
          warningDiv.innerHTML = `⚠️ ${msgData.warning}`;
          warningDiv.style.display = 'block';
        }

        input.value = '';
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });

    closeBtn.addEventListener('click', () => {
      modal.remove();
    });

    input.focus();
  },

  // ============ CRISIS HELP ============
  showCrisisHelp() {
    const overlay = document.createElement('div');
    overlay.id = 'rkive-crisis-overlay';
    overlay.innerHTML = `
      <div class="rkive-crisis-container">
        <div class="rkive-crisis-content">
          <h2>🚨 Crisis Support</h2>
          <p>You don't have to face this alone. Help is available right now.</p>
          
          <div class="rkive-crisis-resource">
            <h3>988 Suicide & Crisis Lifeline</h3>
            <p><strong>Call or text: 988</strong></p>
            <p>Available 24/7 • Free & Confidential</p>
          </div>

          <div class="rkive-crisis-resource">
            <h3>Crisis Text Line</h3>
            <p><strong>Text: HOME to 741741</strong></p>
            <p>Available 24/7 • Free • Confidential</p>
          </div>

          <div class="rkive-crisis-resource">
            <h3>International Association for Suicide Prevention</h3>
            <p><a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank">Find resources in your country</a></p>
          </div>

          <button id="close-crisis-btn" class="rkive-close-crisis-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('close-crisis-btn').addEventListener('click', () => {
      overlay.remove();
    });
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

// ========== RKIVE INTEGRATION HANDLERS ==========
// Add these functions to handle Rkive API calls

async function handleMoodCheckIn() {
  const moodScore = prompt('How are you feeling? (1-10)', '5');
  if (!moodScore) return;

  const score = parseInt(moodScore);
  if (score < 1 || score > 10) {
    alert('Please enter a number between 1 and 10');
    return;
  }

  const note = prompt('Add a note (optional)', '');
  const result = await RkiveAPI.logMood(score, note);

  if (result) {
    alert('Mood logged! 📊');
    updateMoodDisplay();
  }
}

async function updateMoodDisplay() {
  const moods = await RkiveAPI.getMoodHistory();
  const average = await RkiveAPI.getMoodAverage();
  console.log('Mood history:', moods);
  console.log('Weekly average:', average);
}

async function handleArchiveClick() {
  const rooms = await RkiveAPI.getRooms();

  if (rooms.length === 0) {
    alert('No rooms yet. Create one with the Create Room button!');
    return;
  }

  displayRoomsModal(rooms);
}

function displayRoomsModal(rooms) {
  const modal = document.createElement('div');
  modal.id = 'rooms-list-modal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 5000;';

  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 24px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 70vh; overflow-y: auto; color: #333;';

  content.innerHTML = `
    <h2>Your Archive</h2>
    <div style="display: grid; gap: 12px;">
      ${rooms.map(room => `
        <div style="padding: 16px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'" onclick="handleRoomSelect(${room.id}, '${room.title}')">
          <h4 style="margin: 0 0 4px 0;">${room.title}</h4>
          <p style="margin: 0; color: #999; font-size: 12px;">Type: ${room.type} • Created: ${new Date(room.createdAt).toLocaleDateString()}</p>
        </div>
      `).join('')}
    </div>
    <button onclick="this.closest('[id]').remove()" style="width: 100%; margin-top: 16px; padding: 10px; background: #ddd; border: none; border-radius: 6px; cursor: pointer;">Close</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

async function handleRoomSelect(roomId, roomTitle) {
  document.getElementById('rooms-list-modal')?.remove();
  const entries = await RkiveAPI.getRoomEntries(roomId);
  console.log('Room entries:', entries);
  alert('Room loaded: ' + roomTitle);
  RkiveAPI.showRobinChatModal(roomId, roomTitle);
}

async function handleCreateRoom() {
  const title = prompt('Room title (e.g., "Late Night Thoughts")', '');
  if (!title) return;

  const room = await RkiveAPI.createRoom(title, 'reflection');

  if (room) {
    alert('Room created: ' + title + ' ✨');
  }
}

function handleKonektClick() {
  RkiveAPI.showKonektModal();
}

function handleCrisisHelp() {
  RkiveAPI.showCrisisHelp();
}

function handleSwitchUser() {
  localStorage.removeItem('rkive_userId');
  RkiveAPI.currentUser = null;
  RkiveAPI.showUserSwitchModal();
}
