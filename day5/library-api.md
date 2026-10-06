# Library Books REST API Design

## Endpoints

* **GET /api/books**
  * Description: Retrieve a list of all books in the library.
  * Success Code: 200 OK

* **GET /api/books?author={authorName}**
  * Description: Retrieve a list of books filtered by a specific author.
  * Success Code: 200 OK

* **GET /api/books/{id}**
  * Description: Retrieve details for a single book by its ID.
  * Success Code: 200 OK

* **POST /api/books**
  * Description: Add a new book to the library collection.
  * Request Body:
    ```json
    {
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "isbn": "9780743273565",
      "publishedYear": 1925
    }
    ```
  * Success Code: 201 Created

* **PUT /api/books/{id}**
  * Description: Update an existing book's details completely by its ID.
  * Request Body:
    ```json
    {
      "title": "The Great Gatsby - Special Edition",
      "author": "F. Scott Fitzgerald",
      "isbn": "9780743273565",
      "publishedYear": 1925
    }
    ```
  * Success Code: 200 OK

* **DELETE /api/books/{id}**
  * Description: Remove a book from the library collection by its ID.
  * Success Code: 200 OK

---

## Error Handling

* **400 Bad Request**
  * Occurs when a client submits invalid or incomplete data in a request payload.
  * Example: Sending a `POST /api/books` request without the mandatory `title` field.

* **404 Not Found**
  * Occurs when the requested resource or endpoint path does not exist.
  * Example: Sending a `GET /api/books/9999` request for a book ID that does not exist in the database.