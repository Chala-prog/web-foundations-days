# School Database Schema Design (SQLite)

This document details the relational schema for the school management system targeting SQLite compatibility.

## Table Explanations

* **`students`**
  * Stores student profile and contact information.
  * Primary key: `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`).
  * Unique constraint: `email` prevents duplicate registrations.

* **`courses`**
  * Stores details about academic courses offered.
  * Primary key: `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`).
  * Unique constraint: `code` enforces unique course identifiers (e.g., `CS101`).

* **`enrolments`**
  * Serves as the junction table resolving the Many-to-Many relationship between students and courses.
  * Primary key: `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`).
  * Foreign keys: `student_id` references `students(id)` and `course_id` references `courses(id)`.
  * Unique constraint: `UNIQUE(student_id, course_id)` prevents double enrollment.
  * Attributes: Stores the `grade` earned by the student.

---

## Relationships & Join Table Justification

* **Students to Enrolments (One-to-Many):** A single student can have multiple enrollment records.
* **Courses to Enrolments (One-to-Many):** A single course can be linked to multiple enrollment records.
* **Students to Courses (Many-to-Many):** A student takes many courses, and a course has many students.

### Why a Join Table is Required
1. Direct arrays or comma-separated lists in a table column violate **First Normal Form (1NF)**.
2. Creating duplicate student rows per course causes severe data redundancy and update anomalies.
The `enrolments` join table decomposes the Many-to-Many relationship into two clean One-to-Many relationships.

---

## Query Strategy & Indexing

* **Index Target:** `CREATE INDEX idx_enrolments_student_id ON enrolments(student_id);`
* **Performance Impact:** Optimizes `JOIN` operations and transcript filtering for specific students, replacing linear table scans with fast B-Tree indexing.