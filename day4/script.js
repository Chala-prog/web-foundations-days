// Select DOM Elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

/**
 * 1. Calculate word count from input text
 */
function getWordCount(text) {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * 2. Update character & word counters, styling classes, and save draft to localStorage
 */
function updateEditor() {
  const text = noteText.value;
  const length = text.length;
  const words = getWordCount(text);

  // Update text output
  charCount.textContent = `${length} / 200 characters`;
  wordCount.textContent = `${words} word${words === 1 ? "" : "s"}`;

  // Reset counter styling classes
  charCount.classList.remove("warning", "over");

  // Apply required rubric classes based on length limits
  if (length > 200) {
    charCount.classList.add("over");
  } else if (length > 180) {
    charCount.classList.add("warning");
  }

  // Save current text draft to localStorage
  localStorage.setItem("note_draft", text);
}

/**
 * 3. Clear text area, counters, and localStorage draft
 */
function clearEditor() {
  noteText.value = "";
  localStorage.removeItem("note_draft");
  updateEditor();
  noteText.focus();
}

/**
 * 4. Apply selected theme and update button text & localStorage
 */
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark");
    themeToggle.textContent = "Dark mode";
    localStorage.setItem("theme", "light");
  }
}

// ==========================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================

// Input Event: Trigger counter updates and draft saving
noteText.addEventListener("input", updateEditor);

// Keyboard Event: Clear editor when pressing Escape inside textarea
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearEditor();
  }
});

// Click Event: Clear button action
clearBtn.addEventListener("click", clearEditor);

// Click Event: Toggle theme state
themeToggle.addEventListener("click", () => {
  const isCurrentDark = document.body.classList.contains("dark");
  applyTheme(!isCurrentDark);
});

// Initialize Page State on Load
function init() {
  // Restore saved draft text
  const savedDraft = localStorage.getItem("note_draft");
  if (savedDraft !== null) {
    noteText.value = savedDraft;
  }

  // Restore saved theme preference
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    applyTheme(true);
  } else {
    applyTheme(false);
  }

  // Initial update of counters
  updateEditor();
}

init();