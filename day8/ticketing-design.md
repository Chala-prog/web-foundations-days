# TicketHub: System Architecture & System Design Document

---

## 1. System Requirements

### Functional Requirements
1. **Browse & Search Events:** Users can search for upcoming concerts and events by artist, city, or date.
2. **Real-time Seat Map:** Users can view available and reserved seats on an interactive seat map layout.
3. **Hold Seats (10-Minute Expiration):** Users can temporarily reserve selected seats for up to 10 minutes while completing payment details.
4. **Payment Processing & Ticket Issuance:** Users can complete payments securely and receive a confirmed digital ticket with a unique QR code.
5. **View Ticket History:** Users can log in to view their active holds and previously purchased tickets.

### Non-Functional Requirements
1. **Speed (Low Latency):** Static event pages and live seat maps must load in under **200 ms**, even during peak traffic surges.
2. **Correctness (Zero Double-Booking):** The system must guarantee strict ACID transactional consistency so that two users can never purchase the exact same seat.
3. **Fairness (First-Come, First-Served Access):** During high-demand ticket drops, access to seat selection must be managed via a Virtual Waiting Room queue using a fair FIFO (First-In, First-Out) model.
4. **High Availability:** The event browsing interface must achieve **99.99%** uptime.

---

## 2. Capacity Estimations & Peak Comparison

### A. Baseline / Normal Day Traffic
* **Registered Base:** 2,000,000 total users.
* **Daily Visitors:** 50,000 active visitors/day.
* **Page Views:** $50,000 \text{ visitors} \times 10 \text{ pages/visitor} = 500,000 \text{ views/day}$.
* **Normal Read Throughput (Average):**
  $$\text{Average Reads/sec} = \frac{500,000 \text{ views}}{86,400 \text{ seconds}} \approx 5.8 \text{ QPS}$$
* **Normal Ticket Purchases (Writes):** 5,000 tickets sold/day.
* **Normal Write Throughput (Average):**
  $$\text{Average Writes/sec} = \frac{5,000 \text{ writes}}{86,400 \text{ seconds}} \approx 0.058 \text{ TPS}$$

### B. "Big Sale" Peak Traffic (Popular Concert On-Sale)
* **Surge Activity:** 200,000 users attempting to purchase 20,000 available seats within the first 10 minutes (600 seconds).
* **Peak Read Requests (Seat Searches & State Refreshes):**
  Assuming each user generates 15 page views or AJAX polling calls while attempting to select seats:
  $$\text{Total Peak Views} = 200,000 \text{ users} \times 15 = 3,000,000 \text{ views}$$
  $$\text{Peak Reads/sec} = \frac{3,000,000 \text{ views}}{600 \text{ seconds}} = 5,000 \text{ QPS}$$
* **Peak Reservation Requests (Write Attempts):**
  All 200,000 users attempt to hold seats in the first 10 minutes:
  $$\text{Peak Writes/sec} = \frac{200,000 \text{ hold attempts}}{600 \text{ seconds}} \approx 333.3 \text{ TPS}$$

### C. Traffic Comparison Analysis
* **Read Surge Factor:** $\frac{5,000 \text{ QPS}}{5.8 \text{ QPS}} \approx \mathbf{862\times \text{ increase}}$ over normal daily operations.
* **Write Surge Factor:** $\frac{333.3 \text{ TPS}}{0.058 \text{ TPS}} \approx \mathbf{5,746\times \text{ increase}}$ over normal daily operations.
* **Architectural Takeaway:** The database cannot sustain raw unthrottled write throughput spikes of 333.3 TPS alongside 5,000 QPS query reads without falling over. Caching layers and virtual waiting rooms are strictly mandatory.

---

## 3. API Design

### 1. `GET /api/v1/events`
* **Purpose:** Search and list active events.
* **Query Parameters:** `query` (string), `city` (string), `page` (int).
* **Response (`200 OK`):**
  ```json
  {
    "events": [
      {
        "event_id": "evt_9901",
        "title": "Abo-Ali Live in Concert",
        "venue": "Hawassa Stadium",
        "date": "2026-11-20T18:00:00Z"
      }
    ]
  }

  