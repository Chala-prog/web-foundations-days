# TicketHub: System Architecture & Design Document

## 1. Requirements

### Functional Requirements
* **Event Browsing & Search:** Users can view listed events, search by artist/city, and view detailed venue seat maps in real time.
* **Seat Reservation:** Users can select available seats and hold them in a pending state for 10 minutes during checkout.
* **Payment Processing & Ticket Issuance:** Users can purchase held seats via payment processing, generating a unique ticket with a secure QR code.
* **Order History:** Users can view their purchased tickets and active reservations.

### Non-Functional Requirements
* **High Concurrency & Strict Consistency:** Zero double-selling of seats during peak high-concurrency ticket drops (ACID transactional integrity).
* **Low Read Latency:** Search queries and seat map availability load in under $200\text{ ms}$.
* **High Availability:** The browsing and static event pages maintain $99.99\%$ uptime.
* **Graceful Degradation:** During extreme traffic surges, non-critical features (e.g., recommendation engines) degrade without affecting checkout flows.

---

## 2. Capacity Estimations & System Scale

### A. Baseline / Normal Day Traffic
* **Active Daily Visitors:** $50,000\text{ visitors/day}$.
* **Page Views:** $50,000 \times 10 = 500,000\text{ page views/day}$.
* **Average Read Throughput:**
  $$\text{Average Reads/sec} = \frac{500,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{5 \text{ QPS}}$$
* **Normal Daily Ticket Sales (Writes):** $5,000\text{ tickets/day}$.
* **Average Write Throughput:**
  $$\text{Average Writes/sec} = \frac{5,000 \text{ writes}}{100,000 \text{ seconds}} = \mathbf{0.05 \text{ TPS}}$$

### B. Peak Concert On-Sale Traffic (Flash Surge)
* **Concurrent Users:** $200,000\text{ users}$ active within a $10\text{-minute}$ window ($600\text{ seconds}$).
* **Peak Ticket Selection & Read Operations:**
  Assuming each user makes 15 API requests (refreshing seat maps, attempting holds):
  $$\text{Peak Reads/sec} = \frac{200,000 \times 15}{600 \text{ seconds}} = \mathbf{5,000 \text{ QPS}}$$
* **Peak Booking Requests (Writes):**
  $200,000\text{ users}$ competing for $20,000\text{ seats}$:
  $$\text{Peak Writes/sec} = \frac{200,000 \text{ reservation attempts}}{600 \text{ seconds}} \approx \mathbf{333.3 \text{ TPS}}$$

---

## 3. API Design

### 1. `GET /api/v1/events`
* **Purpose:** List and search available events.
* **Query Parameters:** `q` (string), `city` (string), `page` (int), `limit` (int).
* **Response Body (`200 OK`):**
  ```json
  {
    "events": [
      {
        "event_id": "evt_101",
        "title": "World Tour Concert",
        "venue": "National Stadium",
        "event_date": "2026-11-15T20:00:00Z"
      }
    ]
  }