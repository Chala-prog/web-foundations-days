// Starting data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

/**
 * 1. searchNotes(word)
 * Returns an array of notes whose text contains word (case-insensitive).
 */
function searchNotes(word) {
  if (!word) return [];
  const query = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(query));
}

/**
 * 2. longestNote()
 * Returns the note object with the most characters, or null if notes is empty.
 */
function longestNote() {
  if (notes.length === 0) return null;
  return notes.reduce((longest, current) =>
    current.text.length > longest.text.length ? current : longest
  );
}

/**
 * 3. countByCategory()
 * Returns an object counting notes per category, e.g. { personal: 2, work: 1, study: 2 }.
 */
function countByCategory() {
  return notes.reduce((counts, note) => {
    counts[note.category] = (counts[note.category] || 0) + 1;
    return counts;
  }, {});
}

/**
 * 4. getSummary()
 * Returns a sentence like "5 notes: 2 personal, 1 work, 2 study."
 */
function getSummary() {
  const counts = countByCategory();
  const parts = Object.entries(counts).map(
    ([category, count]) => `${count} ${category}`
  );
  return `${notes.length} notes: ${parts.join(", ")}.`;
}

/**
 * 5. isDuplicate(text)
 * Returns true if a note with the same text already exists (ignoring case & extra spaces).
 */
function isDuplicate(text) {
  if (!text) return false;
  const normalizedNew = text.trim().toLowerCase();
  return notes.some(
    (note) => note.text.trim().toLowerCase() === normalizedNew
  );
}

/**
 * 6. addNote(text, category)
 * Adds a note if length is 1-200, not duplicate, and category is personal/work/study.
 * Returns true if added, false otherwise (with a console log explaining why).
 */
function addNote(text, category) {
  const allowedCategories = ["personal", "work", "study"];

  // Validate text existence & length
  if (!text || text.trim().length < 1 || text.trim().length > 200) {
    console.log("Failed to add note: Text must be between 1 and 200 characters.");
    return false;
  }

  // Validate category
  if (!allowedCategories.includes(category)) {
    console.log(`Failed to add note: Category must be one of ${allowedCategories.join(", ")}.`);
    return false;
  }

  // Validate duplicate
  if (isDuplicate(text)) {
    console.log("Failed to add note: A note with identical text already exists.");
    return false;
  }

  // Create & push new note
  const newNote = {
    id: notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1,
    text: text.trim(),
    category: category,
  };

  notes.push(newNote);
  return true;
}

// ==========================================
// TEST LOGS (Visible in Browser Console)
// ==========================================

console.log("--- 1. Testing searchNotes ---");
console.log("Search 'report':", searchNotes("report"));
console.log("Search 'DAY':", searchNotes("DAY"));

console.log("\n--- 2. Testing longestNote ---");
console.log("Longest note:", longestNote());

console.log("\n--- 3. Testing countByCategory ---");
console.log("Counts:", countByCategory());

console.log("\n--- 4. Testing getSummary ---");
console.log("Summary:", getSummary());

console.log("\n--- 5. Testing isDuplicate ---");
console.log("Is 'Call mum' duplicate?", isDuplicate("Call mum"));
console.log("Is 'call   MUM  ' duplicate?", isDuplicate("call   MUM  "));
console.log("Is 'New task' duplicate?", isDuplicate("New task"));

console.log("\n--- 6. Testing addNote ---");
console.log("Add valid note:", addNote("Prepare for Day 4", "study")); // Should return true
console.log("Add duplicate note:", addNote("Call mum", "personal")); // Should return false
console.log("Add invalid category:", addNote("Go shopping", "grocery")); // Should return false
console.log("Add empty note:", addNote("", "personal")); // Should return false

console.log("\n--- Updated Notes Summary ---");
console.log(getSummary());