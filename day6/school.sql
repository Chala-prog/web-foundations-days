-- ============================================================
-- Day 6 Assignment: School Database Schema & Queries
-- Compatible with SQLite (e.g., sqliteonline.com)
-- ============================================================

-- Enable foreign key enforcement (SQLite specific)
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. TABLE CREATION
-- ------------------------------------------------------------

-- Table: Students
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: Courses
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
);

-- Table: Enrolments (Join table for many-to-many relationship)
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    -- Prevent duplicate enrollment of the same student in the same course
    UNIQUE (student_id, course_id)
);

-- ------------------------------------------------------------
-- 2. DATA INSERTION
-- ------------------------------------------------------------

-- Insert Students (3 students + 1 unenrolled student for query testing)
INSERT INTO students (name, email) VALUES
    ('Chala Wakshuma', 'chala@example.com'),
    ('Amina Mohammed', 'amina@example.com'),
    ('Dawit Tadesse', 'dawit@example.com'),
    ('Bethlehem Kebede', 'bethlehem@example.com'); -- Unenrolled student

-- Insert Courses
INSERT INTO courses (title, code) VALUES
    ('Web Development Foundations', 'CS101'),
    ('Database Management Systems', 'CS102'),
    ('Data Structures & Algorithms', 'CS103');

-- Insert Enrolments (5 records across students and courses)
INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),  -- Chala enrolled in Web Dev
    (1, 2, 'B+'), -- Chala enrolled in DBMS
    (2, 1, 'A-'), -- Amina enrolled in Web Dev
    (2, 3, 'A'),  -- Amina enrolled in Data Structures
    (3, 2, 'B');  -- Dawit enrolled in DBMS

-- ------------------------------------------------------------
-- 3. QUERIES
-- ------------------------------------------------------------

-- Query 1: Find all courses for one student (by student name)
SELECT c.id, c.code, c.title, e.grade
FROM courses c
JOIN enrolments e ON c.id = e.course_id
JOIN students s ON e.student_id = s.id
WHERE s.name = 'Chala Wakshuma';

-- Query 2: Find all students enrolled on one specific course (by course code)
SELECT s.id, s.name, s.email, e.grade
FROM students s
JOIN enrolments e ON s.id = e.student_id
JOIN courses c ON e.course_id = c.id
WHERE c.code = 'CS101';

-- Query 3: Get the number of students per course
SELECT c.id, c.code, c.title, COUNT(e.student_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.code, c.title;

-- Query 4: Find students who have no enrolments
SELECT s.id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL;

-- Query 5: Update one enrolment's grade (e.g., Chala's grade in DBMS)
UPDATE enrolments
SET grade = 'A+'
WHERE student_id = 1 AND course_id = 2;