# School Database Design

This document provides a conceptual overview of the relational database structure for the school management system.

## Table Explanations

* **`teachers`**
  * Stores identity and contact details for instructional staff.
  * Primary key: `id` (Unique integer auto-incremented identifier).
  * Unique constraint: `email` prevents duplicate teacher accounts.

* **`students`**
  * Stores core identity and contact information for enrolled individuals.
  * Primary key: `id` (Unique integer auto-incremented identifier).
  * Unique constraint: `email` prevents multiple user registrations under the same address.

* **`courses`**
  * Stores details about subjects/classes offered by the school.
  * Primary key: `id` (Unique integer identifier).
  * Foreign key: `teacher_id` references `teachers(id)`.
  * Unique constraint: `code` enforces distinct academic identifiers (e.g., `CS101`).

* **`enrolments`**
  * Serves as the junction/join table linking students to their respective courses.
  * Primary key: `id` (Unique integer auto-incremented identifier).
  * Foreign keys: `student_id` references `students(id)` and `course_id` references `courses(id)`.
  * Unique constraint: `UNIQUE(student_id, course_id)` prevents duplicate enrollments of the same student into the same class.

---

## Relationships & Join Table Justification

* **Teachers to Courses (One-to-Many):** One teacher can instruct multiple courses, but each course is taught by one primary teacher.
* **Students to Enrolments (One-to-Many):** One student can have multiple enrolment entries, but each individual enrolment record belongs to exactly one student.
* **Courses to Enrolments (One-to-Many):** One course can have multiple enrolment entries, but each individual enrolment record belongs to exactly one course.
* **Students to Courses (Many-to-Many):** A student can take many courses simultaneously, and a single course can contain many students.

### Why a Join Table is Necessary
Relational databases cannot natively represent direct Many-to-Many relationships without breaking database normalization standards:
1. Storing a list of course IDs in a single `students` column (e.g., `1,2,3`) violates First Normal Form (1NF) because column values must be atomic.
2. Creating duplicate rows in `students` for every course enrolled causes massive data redundancy and update anomalies.

The `enrolments` join table breaks down the Many-to-Many relationship into two clean One-to-Many relationships, maintaining integrity and allowing extra operational attributes like `grade` and `enrolled_at`.

---

## Indexing Strategy

* **Index Target:** `CREATE INDEX idx_enrolments_student_id ON enrolments(student_id);`
* **Reason:** Filtering enrolments by a specific student ID (e.g., fetching a student's course list or transcript) requires searching the `enrolments` table. Without an index, the database engine must perform a Full Table Scan, checking every row. Adding an index on `student_id` drastically improves query performance as the table scales.

---

## Architectural Choice: SQL vs. NoSQL

For a school administration system, **SQL (Relational Database)** is the superior choice over NoSQL. Educational records depend heavily on strict relational integrity, ACID compliance, and structured queries. SQL ensures that data inconsistencies—such as orphaned enrolment records referencing deleted students or accidental duplicate registrations—are strictly prevented at the schema level via foreign key constraints and `UNIQUE` indexes. Additionally, school systems frequently perform complex relational joins (such as generating transcripts, course rosters, and grade averages), which relational SQL databases are natively designed to handle with high efficiency.