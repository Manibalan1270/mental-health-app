/**
 * RKIVE HTML Integration Examples
 * 
 * Add the rkive-frontend.js script to your HTML first:
 * <script src="http://localhost:3000/rkive-frontend.js"></script>
 * 
 * Then use these examples in your button/element onclick handlers
 */

// ============================================
// EXAMPLE 1: MOOD CHECK-IN
// ============================================
// Add this to your "Check-in" button or mood selector
async function handleMoodCheckIn() {
  // Get mood score (1-10) from your UI
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
    // Update your mood graph/display here
    updateMoodDisplay();
  }
}

// Update mood graph (example)
async function updateMoodDisplay() {
  const moods = await RkiveAPI.getMoodHistory();
  const average = await RkiveAPI.getMoodAverage();
  
  // Display on your page
  console.log('Mood history:', moods);
  console.log('Weekly average:', average);
  
  // Update your chart/display element
  if (document.getElementById('mood-graph')) {
    document.getElementById('mood-graph').innerHTML = `
      <p>Your weekly mood average: ${average.toFixed(1)}/10</p>
    `;
  }
}

// ============================================
// EXAMPLE 2: ARCHIVE / ROOMS VIEW
// ============================================
// Add this to your "Archive" button
async function handleArchiveClick() {
  const rooms = await RkiveAPI.getRooms();
  
  if (rooms.length === 0) {
    alert('No rooms yet. Create one with the "Create Room" button!');
    return;
  }

  // Create a modal or display rooms in your UI
  displayRoomsModal(rooms);
}

function displayRoomsModal(rooms) {
  const modal = document.createElement('div');
  modal.id = 'rooms-list-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex; align-items: center;
    justify-content: center; z-index: 5000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white; padding: 24px; border-radius: 12px;
    max-width: 600px; width: 90%; max-height: 70vh; overflow-y: auto;
  `;

  content.innerHTML = `
    <h2>Your Archive</h2>
    <div style="display: grid; gap: 12px;">
      ${rooms.map(room => `
        <div style="
          padding: 16px; border: 1px solid #ddd; border-radius: 8px;
          cursor: pointer; transition: all 0.2s;
        " onmouseover="this.style.background='#f5f5f5'"
           onmouseout="this.style.background='white'"
           onclick="handleRoomSelect(${room.id}, '${room.title}')">
          <h4 style="margin: 0 0 4px 0;">${room.title}</h4>
          <p style="margin: 0; color: #999; font-size: 12px;">
            Type: ${room.type} • Created: ${new Date(room.createdAt).toLocaleDateString()}
          </p>
        </div>
      `).join('')}
    </div>
    <button onclick="this.closest('[id]').remove()" style="
      width: 100%; margin-top: 16px; padding: 10px;
      background: #ddd; border: none; border-radius: 6px; cursor: pointer;
    ">Close</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

async function handleRoomSelect(roomId, roomTitle) {
  // Remove modal
  document.getElementById('rooms-list-modal')?.remove();

  // Load room entries
  const entries = await RkiveAPI.getRoomEntries(roomId);
  console.log(`Room "${roomTitle}" entries:`, entries);

  // Display room content in your UI
  displayRoomContent(roomId, roomTitle, entries);
}

function displayRoomContent(roomId, roomTitle, entries) {
  // Update your page with room content
  if (document.getElementById('room-display')) {
    document.getElementById('room-display').innerHTML = `
      <h2>${roomTitle}</h2>
      <div style="margin: 16px 0;">
        ${entries.map(entry => `
          <div style="padding: 12px; background: #f9f9f9; margin: 8px 0; border-radius: 6px;">
            <small style="color: #999;">${new Date(entry.timestamp).toLocaleString()}</small>
            <p>${entry.content}</p>
          </div>
        `).join('')}
      </div>
      <button onclick="RkiveAPI.showRobinChatModal(${roomId}, '${roomTitle}')">
        Chat with Robin
      </button>
    `;
  }
}

// ============================================
// EXAMPLE 3: CREATE ROOM BUTTON
// ============================================
// Add this to your "Create Room" button
async function handleCreateRoom() {
  const title = prompt('Room title (e.g., "Late Night Thoughts")', '');
  
  if (!title) return;

  const room = await RkiveAPI.createRoom(title, 'reflection');
  
  if (room) {
    alert(`Room "${title}" created! ✨`);
    // Refresh room list
    handleArchiveClick();
  }
}

// ============================================
// EXAMPLE 4: ROBIN AI CHAT IN ROOM
// ============================================
// Already handled by RkiveAPI.showRobinChatModal(roomId, roomTitle)
// Just call it from a button: onclick="RkiveAPI.showRobinChatModal(1, 'My Room')"

// OR add this for a manual flow:
async function manualRobinChat(roomId, roomTitle) {
  RkiveAPI.showRobinChatModal(roomId, roomTitle);
}

// ============================================
// EXAMPLE 5: KONEKT SOCIAL MATCHING
// ============================================
// Add this to your "Konekt" button
function handleKonektClick() {
  RkiveAPI.showKonektModal();
}

// ============================================
// EXAMPLE 6: CRISIS HELP BUTTON
// ============================================
// Add this to your "Crisis Help" or "Emergency" button
function handleCrisisHelp() {
  RkiveAPI.showCrisisHelp();
}

// ============================================
// EXAMPLE 7: SWITCH USER
// ============================================
// Add this to your "Switch Account" button
function handleSwitchUser() {
  localStorage.removeItem('rkive_userId');
  RkiveAPI.currentUser = null;
  RkiveAPI.showUserSwitchModal();
}

// ============================================
// HTML INTEGRATION TEMPLATE
// ============================================
/*

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rkive - Mental Wellness</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
    .button { padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
    .btn-primary { background: #4A90D9; color: white; }
    .btn-secondary { background: #50C878; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center; }
    .card h3 { margin-bottom: 12px; color: #333; }
    .card p { color: #666; margin-bottom: 16px; }
  </style>
</head>
<body>
  <!-- LOAD RKIVE FRONTEND LIBRARY -->
  <script src="http://localhost:3000/rkive-frontend.js"></script>
  <script>
    // Define your handler functions here (from above)
    // ... (include the functions defined above)
  </script>

  <div class="container">
    <div class="header">
      <h1>Rkive Dashboard</h1>
      <button class="button btn-danger" onclick="handleSwitchUser()">Switch User</button>
    </div>

    <!-- MOOD CHECK-IN CARD -->
    <div class="grid">
      <div class="card">
        <h3>📊 Mood Check-In</h3>
        <p>How are you feeling today?</p>
        <button class="button btn-primary" onclick="handleMoodCheckIn()">Check In</button>
      </div>

      <!-- ARCHIVE CARD -->
      <div class="card">
        <h3>📚 Archive</h3>
        <p>View your private rooms & reflections</p>
        <button class="button btn-primary" onclick="handleArchiveClick()">View Archive</button>
      </div>

      <!-- CREATE ROOM CARD -->
      <div class="card">
        <h3>✨ Create Room</h3>
        <p>Start a new private reflection space</p>
        <button class="button btn-secondary" onclick="handleCreateRoom()">Create Room</button>
      </div>

      <!-- KONEKT CARD -->
      <div class="card">
        <h3>💚 Konekt</h3>
        <p>Connect with others in your community</p>
        <button class="button btn-secondary" onclick="handleKonektClick()">Start Konekt</button>
      </div>

      <!-- CRISIS HELP CARD -->
      <div class="card">
        <h3>🚨 Crisis Help</h3>
        <p>Immediate mental health support</p>
        <button class="button btn-danger" onclick="handleCrisisHelp()">Get Help Now</button>
      </div>
    </div>

    <!-- Room content display area -->
    <div id="room-display" style="margin-top: 40px;"></div>
  </div>
</body>
</html>

*/
