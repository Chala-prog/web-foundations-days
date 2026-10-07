-- Enable foreign key support in SQLite
PRAGMA foreign_keys = ON;

-- ==========================================
-- 1. DROP EXISTING TABLES (Clean Re-run)
-- ==========================================
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ==========================================
-- 2. CREATE TABLES
-- ==========================================

-- Students Table
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);

-- Courses Table
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL
);

-- Enrolments Table (Junction Table)
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- Performance Index for Student Lookups
CREATE INDEX idx_enrolments_student_id ON enrolments(student_id);

-- ==========================================
-- 3. INSERT SAMPLE DATA
-- ==========================================

INSERT INTO students (first_name, last_name, email) VALUES
('Chala', 'Wakshuma', 'chala@example.com'),
('Abebe', 'Bikila', 'abebe@example.com'),
('Sara', 'Tadesse', 'sara@example.com'),
('Dawit', 'Kebede', 'dawit@example.com');

INSERT INTO courses (code, title) VALUES
('CS101', 'Introduction to Computer Science'),
('WEB102', 'Web Foundations'),
('DB103', 'Database Management Systems'),
('MATH104', 'Discrete Mathematics');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
(1, 1, 'A'),
(1, 2, 'A'),
(1, 3, 'B'),
(2, 1, 'B'),
(2, 2, 'C'),
(3, 2, 'A');

-- ==========================================
-- 4. FIVE REQUIRED QUERIES
-- ==========================================

-- Query 1: List all students and their enrolled courses (INNER JOIN)
SELECT 
    s.first_name || ' ' || s.last_name AS student_name,
    c.code AS course_code,
    c.title AS course_title,
    e.grade
FROM enrolments e
JOIN students s ON e.student_id = s.id
JOIN courses c ON e.course_id = c.id;

-- Query 2: Get all courses for a specific student by ID (Filtering with JOIN)
SELECT 
    c.code,
    c.title,
    e.grade
FROM enrolments e
JOIN courses c ON e.course_id = c.id
WHERE e.student_id = 1;

-- Query 3: Count total number of enrolled students per course (GROUP BY)
SELECT 
    c.code,
    c.title,
    COUNT(e.student_id) AS total_enrolled
FROM courses c
JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id;

-- Query 4: List all students including those NOT enrolled in any course (LEFT JOIN)
SELECT 
    s.first_name || ' ' || s.last_name AS student_name,
    c.title AS course_title,
    COALESCE(e.grade, 'N/A') AS grade
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
LEFT JOIN courses c ON e.course_id = c.id;

-- Query 5: List all courses including those with zero enrollments (LEFT JOIN + GROUP BY)
SELECT 
    c.code,
    c.title,
    COUNT(e.student_id) AS total_students
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id;