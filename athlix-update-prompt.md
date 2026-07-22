# Athlix AI Fitness App - Complete Upgrade

## Current Application
- URL: athlix-v2-1.vercel.app
- AI fitness coach powered by Gemini
- User: gajeradhrumil38
- Current issue: Requires repeating context ("see previous workout"), high token usage, no copy feature

## Required Upgrades

### 1. PERSISTENT WORKOUT STORAGE
**Goal**: Eliminate need to say "see previous workout"

**Implementation**:
- Use `window.storage` API (persistent across sessions)
- Store structure:
  ```javascript
  // Storage keys:
  // "workouts:YYYY-MM-DD" -> workout details
  // "user_profile" -> PRs, preferences
  // "api_usage" -> token tracking
  ```

- Workout data structure:
  ```javascript
  {
    date: "2025-04-29",
    focus: "Legs and Core",
    exercises: [
      {
        name: "Leg Press",
        sets: 3,
        reps: "10-12",
        weight: "291lbs",
        notes: "Push past PR"
      }
    ],
    completed: true
  }
  ```

**Auto-load on startup**: 
- Fetch last 7 days of workouts
- Include in system prompt as context (NOT as conversation)
- Format: "User's recent training: [Day 1: Chest+Shoulders, Day 2: Back, Day 3: Legs]"

### 2. COPY WORKOUT FEATURE
**Add copy buttons**:
- Individual exercise copy (for Googling)
- Full workout copy
- Formatted for easy pasting

**Example output when copied**:
```
Leg Press: 3 sets x 10-12 reps @ 291lbs
Seated Leg Curl: 3 sets x 8-10 reps
Bridge Pose: hold time/reps focus
```

**UI**: 
- Small copy icon next to each exercise
- Toast notification: "Copied! Paste in Google to find form videos"

### 3. TOKEN USAGE TRACKING & DISPLAY

**Track in storage**:
```javascript
{
  total_tokens_used: 125000,
  total_requests: 45,
  current_month_tokens: 25000,
  current_month_requests: 8,
  last_reset: "2025-04-01"
}
```

**Update after each API call**:
- Extract `usage.total_tokens` from API response
- Add to running total
- Save to `window.storage.set('api_usage', data)`

**Display in Settings**:
```
⚙️ Settings
━━━━━━━━━━━━━━━━━
API Key: sk-ant-***************
[Show] [Edit]

📊 AI Usage Stats
━━━━━━━━━━━━━━━━━
This Month: 25,000 tokens (8 workouts)
All Time: 125,000 tokens (45 workouts)
Avg per workout: ~2,777 tokens

💡 Tip: Each workout uses ~2.5K tokens
```

### 4. TOKEN OPTIMIZATION

**CRITICAL: Use system prompt instead of conversation history**

**OLD (wasteful)**:
```javascript
messages: [
  { role: "user", content: "Which exercises today?" },
  { role: "assistant", content: "Since you did Chest..." }, // 200 tokens
  { role: "user", content: "What about legs?" },
  { role: "assistant", content: "Based on yesterday..." }, // 200 tokens
  { role: "user", content: "New workout today" }
]
// Total: ~600+ tokens of history sent each time
```

**NEW (efficient)**:
```javascript
// System prompt includes context
const systemPrompt = `You are Athlix AI fitness coach for ${username}.

RECENT TRAINING (auto-loaded):
- Apr 28: Chest + Shoulders ✓
- Apr 26: Back ✓  
- Apr 24: Legs (PR: Leg Press 291lbs x 13)

USER PROFILE:
- PRs: Leg Press 291lbs x 13
- Preferences: [auto-detected from past workouts]

INSTRUCTIONS:
- Suggest workouts based on recent training
- Never repeat muscle groups within 48 hours
- Keep responses concise (under 200 tokens)
- Format exercises with sets/reps clearly
- Don't explain recovery unless asked
`;

messages: [
  { role: "user", content: "What should I do today?" }
]
// Total: ~150 tokens vs 600+
```

**Token savings**: 60-80% reduction per request

### 5. UI IMPROVEMENTS

**Add Quick Action Buttons**:
```
┌─────────────────────────────┐
│  Today's Workout    📋      │
│  Log Workout       ✓        │
│  View History      📊       │
│  Settings          ⚙️       │
└─────────────────────────────┘
```

**Exercise Cards with Copy**:
```
┌─────────────────────────────┐
│ * Leg Press               📋 │ <- copy icon
│   3 sets × 10-12 reps        │
│   Target: 291lbs+ (beat PR!) │
└─────────────────────────────┘
```

**Settings Panel**:
```
┌─────────────────────────────┐
│ ⚙️ Settings                  │
├─────────────────────────────┤
│ API Key                      │
│ sk-ant-****** [Edit]         │
│                              │
│ 📊 AI Usage                  │
│ This month: 25K tokens       │
│ All time: 125K tokens        │
│                              │
│ 🗑️ Clear History             │
│ 🔄 Reset Stats               │
└─────────────────────────────┘
```

### 6. TECHNICAL IMPLEMENTATION DETAILS

**File structure needed**:
```
src/
  components/
    WorkoutCard.jsx       // Exercise display with copy
    QuickActions.jsx      // Action buttons
    Settings.jsx          // Settings panel with usage
  hooks/
    useWorkoutStorage.js  // Storage operations
    useTokenTracking.js   // Track API usage
  utils/
    apiClient.js          // Gemini API calls + token tracking
    workoutFormatter.js   // Format for copying
```

**Key functions to implement**:

```javascript
// 1. Save workout after completion
async function saveWorkout(workout) {
  await window.storage.set(
    `workouts:${workout.date}`,
    JSON.stringify(workout)
  );
}

// 2. Load recent workouts for context
async function getRecentWorkouts(days = 7) {
  const workouts = [];
  for (let i = 0; i < days; i++) {
    const date = getDateString(i); // YYYY-MM-DD
    const workout = await window.storage.get(`workouts:${date}`);
    if (workout) workouts.push(JSON.parse(workout.value));
  }
  return workouts;
}

// 3. Build system prompt with context
function buildSystemPrompt(username, recentWorkouts, userProfile) {
  const workoutSummary = recentWorkouts
    .map(w => `- ${w.date}: ${w.focus}`)
    .join('\n');
  
  return `You are Athlix AI for ${username}.

RECENT TRAINING:
${workoutSummary}

INSTRUCTIONS:
- Suggest next workout avoiding recent muscle groups
- Keep responses under 200 tokens
- Format: "* Exercise: X sets × Y reps"`;
}

// 4. Track tokens after API call
async function trackTokenUsage(tokensUsed) {
  const stats = await window.storage.get('api_usage');
  const data = stats ? JSON.parse(stats.value) : {
    total_tokens_used: 0,
    total_requests: 0,
    current_month_tokens: 0,
    current_month_requests: 0,
    last_reset: new Date().toISOString().slice(0, 7) // YYYY-MM
  };
  
  // Check if new month
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (data.last_reset !== currentMonth) {
    data.current_month_tokens = 0;
    data.current_month_requests = 0;
    data.last_reset = currentMonth;
  }
  
  data.total_tokens_used += tokensUsed;
  data.total_requests += 1;
  data.current_month_tokens += tokensUsed;
  data.current_month_requests += 1;
  
  await window.storage.set('api_usage', JSON.stringify(data));
  return data;
}

// 5. Copy workout to clipboard
function copyExercise(exercise) {
  const text = `${exercise.name}: ${exercise.sets} sets × ${exercise.reps} reps${exercise.weight ? ' @ ' + exercise.weight : ''}`;
  navigator.clipboard.writeText(text);
  showToast('Copied! Paste in Google to find form videos');
}
```

### 7. API CALL OPTIMIZATION

**Current approach** (wasteful):
- Sends full conversation history
- Each request: 500-1000 tokens

**New approach** (efficient):
- Build context from storage
- Send only current question
- Each request: 150-300 tokens

**Implementation**:
```javascript
async function getWorkoutSuggestion(userInput) {
  // Load context from storage (not conversation)
  const recentWorkouts = await getRecentWorkouts(7);
  const userProfile = await getUserProfile();
  
  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(
    username, 
    recentWorkouts, 
    userProfile
  );
  
  // Make API call with minimal messages
  const response = await fetch('https://api.gemini.com/v1/generate', {
    method: 'POST',
    body: JSON.stringify({
      systemPrompt: systemPrompt,  // Context here
      messages: [
        { role: 'user', content: userInput }  // Only current question
      ],
      maxTokens: 200  // Force concise responses
    })
  });
  
  const data = await response.json();
  
  // Track token usage
  await trackTokenUsage(data.usage.total_tokens);
  
  return data;
}
```

## Success Metrics
- ✅ Zero mentions of "see previous workout" needed
- ✅ Token usage reduced by 60-80%
- ✅ Copy feature on all exercises
- ✅ Usage stats visible in settings
- ✅ Workouts auto-load on startup

## Testing Checklist
- [ ] Create workout → saves to storage
- [ ] Restart app → workouts auto-load
- [ ] Ask "what should I do today" → gets context without prompting
- [ ] Copy exercise → clipboard has formatted text
- [ ] Check settings → token count accurate
- [ ] New month → stats reset properly

## Additional Nice-to-Haves
- Export workouts as CSV
- Weekly summary view
- PR tracking and celebrations
- Offline mode (cache last suggestion)
