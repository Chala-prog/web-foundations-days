# Library API Design

This document outlines the RESTful API design for managing a library's `books` collection.

## API Endpoints

* **List All Books**
  * **Method:** `GET`
  * **Path:** `/api/v1/books`
  * **Description:** Retrieves a complete list of all books in the library catalogue.
  * **Success Status Code:** `200 OK`

* **Get a Single Book**
  * **Method:** `GET`
  * **Path:** `/api/v1/books/:id`
  * **Description:** Retrieves detailed information for a specific book by its unique ID.
  * **Success Status Code:** `200 OK`

* **Create a Book**
  * **Method:** `POST`
  * **Path:** `/api/v1/books`
  * **Description:** Adds a new book entry to the library catalogue.
  * **Example Request Body:**
    ```json
    {
      "title": "The Pragmatic Programmer",
      "author": "Andrew Hunt",
      "isbn": "978-0201616224",
      "publishedYear": 1999
    }
    ```
  * **Success Status Code:** `201 Created`

* **Update a Book**
  * **Method:** `PUT`
  * **Path:** `/api/v1/books/:id`
  * **Description:** Updates the existing details of a specific book by its ID.
  * **Example Request Body:**
    ```json
    {
      "title": "The Pragmatic Programmer: Your Journey To Mastery",
      "author": "Andrew Hunt",
      "isbn": "978-0135957059",
      "publishedYear": 2019
    }
    ```
  * **Success Status Code:** `200 OK`

* **Delete a Book**
  * **Method:** `DELETE`
  * **Path:** `/api/v1/books/:id`
  * **Description:** Removes a specific book from the library catalogue by its ID.
  * **Success Status Code:** `200 OK` (or `204 No Content`)

* **List Books by Author**
  * **Method:** `GET`
  * **Path:** `/api/v1/books?author=:authorName`
  * **Description:** Retrieves a filtered list of books written by a specific author using a query parameter.
  * **Success Status Code:** `200 OK`

---

## Error Handling

* **400 Bad Request**
  * **When it occurs:** Sent when the server receives invalid client data, such as a missing required field (e.g., submitting a `POST` request to create a book without a `title` field) or malformed JSON payloads.

* **404 Not Found**
  * **When it occurs:** Sent when a requested resource does not exist on the server, such as attempting a `GET`, `PUT`, or `DELETE` request for a non-existent book ID (e.g., `/api/v1/books/999999`).