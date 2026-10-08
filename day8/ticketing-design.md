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
 ---

### 2. GET /api/v1/events/{eventId}/seats
* Purpose: Retrieve live seat map layout and availability state.
* Response (200 OK):
```json
JSON
{
  "event_id": "evt_9901",
  "seats": [
    { "seat_id": "ST-A10", "status": "AVAILABLE", "price": 150.00 },
    { "seat_id": "ST-A11", "status": "HELD", "price": 150.00 }
  ]
}
---

### 3. POST /api/v1/reservations
* Purpose: Hold selected seats for a 10-minute checkout window.
* Request Body:

JSON
{
  "event_id": "evt_9901",
  "seat_ids": ["ST-A10"]
}
Response (201 Created):
JSON
{
  "reservation_id": "res_5541",
  "expires_at": "2026-10-08T10:15:00Z",
  "status": "PENDING"
}

---
### 4. POST /api/v1/payments/checkout
Purpose: Complete payment and confirm ticket purchase.
Request Body:

JSON
{
  "reservation_id": "res_5541",
  "payment_token": "tok_pay_99211"
}
Response (200 OK):

JSON
{
  "ticket_id": "tkt_10022",
  "status": "CONFIRMED",
  "qr_code": "[https://cdn.tickethub.com/qr/tkt_10022.png](https://cdn.tickethub.com/qr/tkt_10022.png)"
}

---
### 5. GET /api/v1/users/{userId}/tickets
Purpose: Retrieve a user's purchased tickets.

Response (200 OK):

JSON
{
  "tickets": [
    {
      "ticket_id": "tkt_10022",
      "event_title": "Abo-Ali Live in Concert",
      "seat_number": "ST-A10",
      "qr_code": "[https://cdn.tickethub.com/qr/tkt_10022.png](https://cdn.tickethub.com/qr/tkt_10022.png)"
    }
  ]
}

---
# TicketHub: Ticketing System Design (Day 8)

Facts given: 2 million registered users; 50,000 visitors on a normal day, each viewing 10 pages; 5,000 tickets sold on a normal day; a popular concert puts 20,000 seats on sale and 200,000 people try to buy them in the first 10 minutes.

---

## 1. Requirements

### Functional
1. **Browse events:** search and list upcoming events by artist, city or date.
2. **View seats:** see a seat map showing which seats are available, held or sold.
3. **Hold seats:** pick 1-6 seats and hold them for 10 minutes while paying.
4. **Pay:** pay for the held seats and receive confirmed tickets (with a QR code).
5. **View my tickets:** see my purchased tickets and my active holds.

### Non-functional
| Quality | Requirement | How we measure it |
|---|---|---|
| **Speed** | Event list and seat map respond in < 200 ms (p95), even during a big sale. Holding a seat responds in < 500 ms. | p95 latency per endpoint |
| **Correctness** | A seat is **never** sold to two people. A user is never charged without getting a ticket (or an automatic refund). Holds always expire. | Zero double-booked seats; reconciliation job finds 0 mismatches between payments and tickets |
| **Fairness** | First come, first served. People who arrive first get into seat selection first. One person cannot hog seats (max 6 per order, one active hold per user per event, bots rate-limited). | Queue is FIFO; per-user limits enforced server-side |
| **Availability** | Browsing stays up (99.9%+) even if checkout is overloaded. | Uptime; browsing works when payment is down |
| **Scalability** | Handle ~200x normal read load and thousands of times normal write attempts for short bursts. | Load tests at 3x expected peak |

Priority when they conflict: **correctness > fairness > speed > cost.** It is acceptable to make people wait in a queue; it is never acceptable to sell a seat twice.

---

## 2. Traffic Estimates

### Normal day
- Page views: 50,000 visitors x 10 pages = **500,000 views/day**
- Average: 500,000 / 86,400 s = **~6 requests/sec**
- Real traffic is not flat. Assume the busiest hour is 5x average: **~30 requests/sec**
- Sales: 5,000 tickets/day / 86,400 = **~0.06 tickets/sec** (peak hour maybe ~0.3/sec)
- Only about 10% of visitors buy (5,000 / 50,000), so reads outnumber writes ~100 to 1.

A single modest database server handles this easily.

### Big sale (first 10 minutes = 600 seconds)
- People arriving: 200,000 / 600 = **~333 new users/sec** (in practice most arrive in the first minute, so the spike is sharper, perhaps 1,000+/sec at second zero).
- Reads: assume each person makes ~15 requests (event page, seat map, refreshes): 200,000 x 15 = 3,000,000 / 600 = **~5,000 requests/sec** average, **10,000-15,000/sec** in the first minute.
- Hold attempts: most people try several times because seats get taken: assume 3 attempts each = 600,000 / 600 = **~1,000 hold attempts/sec**.
- Successful purchases: capped by supply. At most 20,000 seats / 600 s = **~33 sales/sec**.
- Competition: 200,000 buyers for 20,000 seats = **10 people per seat; 90% will leave empty-handed.**

### Comparison
| | Normal (avg) | Normal (busy hour) | Big sale | Increase vs busy hour |
|---|---|---|---|---|
| Read requests/sec | 6 | 30 | 5,000 - 15,000 | ~170x - 500x |
| Hold attempts/sec | ~0.1 | ~0.3 | ~1,000 | ~3,000x |
| Completed sales/sec | 0.06 | 0.3 | up to 33 | ~100x |

**Takeaways**
1. The system is idle most of the time and overwhelmed for ten minutes, so we design for the spike, not the average.
2. Reads grow hundreds of times but are cacheable. Writes grow thousands of times and are **not** cacheable, and they all fight over the same 20,000 rows (a hot spot).
3. Only ~33 sales/sec can ever succeed. Our database can handle that, so the job is to **protect the database from the other 99% of the traffic**, which is guaranteed to fail anyway.

---

## 3. API Design

Base path `/api/v1`. All write endpoints require a login token (`Authorization: Bearer ...`). Errors use standard HTTP codes with `{ "error": "CODE", "message": "..." }`.

### 3.1 Browse events
`GET /events?query=&city=&date_from=&page=1&page_size=20`
```json
200 OK
{
  "events": [
    { "event_id": 9901, "title": "Abo-Ali Live", "venue": "Hawassa Stadium",
      "starts_at": "2026-11-20T18:00:00Z", "min_price": 800, "status": "ON_SALE" }
  ],
  "page": 1, "total_pages": 7
}
```
`GET /events/{event_id}` returns details for one event. Both are public, cached at the CDN (30-60 s).

### 3.2 View seats
`GET /events/{event_id}/seats?section=A`
```json
200 OK
{
  "event_id": 9901,
  "as_of": "2026-11-20T17:58:03Z",
  "seats": [
    { "seat_id": 501, "section": "A", "row": "1", "number": 1, "price": 1500, "status": "AVAILABLE" },
    { "seat_id": 502, "section": "A", "row": "1", "number": 2, "price": 1500, "status": "HELD" },
    { "seat_id": 503, "section": "A", "row": "1", "number": 3, "price": 1500, "status": "SOLD" }
  ]
}
```
Served from cache (1-2 s old). The seat map is a hint only; the hold request is the real decision.

### 3.3 Hold seats
`POST /events/{event_id}/holds`  (header `Idempotency-Key: <uuid>`)
```json
Request:  { "seat_ids": [501, 504] }

201 Created
{ "hold_id": "h_77a1", "seat_ids": [501, 504], "expires_at": "2026-11-20T18:10:05Z", "total": 3000 }

409 Conflict   { "error": "SEAT_UNAVAILABLE", "unavailable_seat_ids": [504] }
429 Too Many Requests / 202 Accepted (waiting room: see section 6)
```
All-or-nothing: either every requested seat is held or none is.

`DELETE /holds/{hold_id}` releases the seats early.

### 3.4 Pay
`POST /holds/{hold_id}/pay`  (header `Idempotency-Key: <uuid>`)
```json
Request:  { "payment_token": "tok_from_payment_provider" }

201 Created
{ "order_id": 31001, "status": "PAID", "tickets": [ { "ticket_id": 88001, "seat_id": 501 } ] }

410 Gone       { "error": "HOLD_EXPIRED" }
402 Payment Required { "error": "PAYMENT_DECLINED" }
```
The idempotency key means a double-click or a network retry never charges twice.

### 3.5 View my tickets
`GET /me/tickets` (and `GET /me/orders/{order_id}`)
```json
200 OK
{
  "active_holds": [ { "hold_id": "h_77a1", "event_id": 9901, "expires_at": "..." } ],
  "tickets": [ { "ticket_id": 88001, "event_title": "Abo-Ali Live", "section": "A", "row": "1",
                 "number": 1, "qr_code": "TKT-88001-9F3A..." } ]
}
```

---

## 4. Database Design (PostgreSQL, relational because correctness matters most)

 +--------------------+       +--------------------+
 |       Users        |       |       Events       |
 +--------------------+       +--------------------+
 | user_id (PK)       |       | event_id (PK)      |
 | email              |       | title              |
 | password_hash      |       | venue_name         |
 +---------+----------+       | start_time         |
           |                  +---------+----------+
           |                            |
           |                            |
           v                            v
 +--------------------+       +--------------------+
 |    Reservations    |       |       Seats        |
 +--------------------+       +--------------------+
 | reservation_id(PK) |       | seat_id (PK)       |
 | user_id (FK)       |       | event_id (FK)      |
 | status             |       | seat_number        |
 | expires_at         |       | status             |
 +---------+----------+       | version            |
           |                  +---------+----------+
           |                            ^
           v                            |
 +--------------------+                 |
 |      Tickets       |                 |
 +--------------------+                 |
 | ticket_id (PK)     |                 |
 | reservation_id(FK) |                 |
 | user_id (FK)       |-----------------+
 | seat_id (FK)       |
 | qr_code            |
 +--------------------+

```sql
CREATE TABLE users (
  user_id        BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  event_id     BIGSERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  venue        TEXT NOT NULL,
  city         TEXT NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  on_sale_at   TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('DRAFT','ON_SALE','SOLD_OUT','CANCELLED'))
);
CREATE INDEX idx_events_city_date ON events (city, starts_at);

CREATE TABLE seats (
  seat_id          BIGSERIAL PRIMARY KEY,
  event_id         BIGINT NOT NULL REFERENCES events(event_id),
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INT  NOT NULL,
  price            INT  NOT NULL CHECK (price >= 0),
  status           TEXT NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE','HELD','SOLD')),
  held_by          BIGINT REFERENCES users(user_id),
  hold_expires_at  TIMESTAMPTZ,
  UNIQUE (event_id, section, row_label, seat_number),          -- a physical seat exists once per event
  CHECK ((status = 'HELD') = (held_by IS NOT NULL AND hold_expires_at IS NOT NULL))
);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);

CREATE TABLE orders (
  order_id         BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(user_id),
  event_id         BIGINT NOT NULL REFERENCES events(event_id),
  total_amount     INT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  idempotency_key  UUID NOT NULL UNIQUE,                       -- retries cannot create a second order
  payment_ref      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  ticket_id  BIGSERIAL PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(order_id),
  seat_id    BIGINT NOT NULL UNIQUE REFERENCES seats(seat_id), -- THE double-booking guard
  qr_code    TEXT NOT NULL UNIQUE
);
```

Relationships: a user has many orders; an event has many seats; an order has many tickets; each ticket maps to exactly one seat (and a seat to at most one ticket).

---

## 5. Preventing Double-Booking

Two layers: **atomic transactions** do the work, and a **database constraint** guarantees that even a bug cannot break the rule.

### Step 1: Hold (atomic conditional update)
Naive code (wrong): read the seat, check it is free, then update it. Between the read and the write, another user can do the same, and both succeed (a race condition). Instead, put the check **inside** the update so the database does check-and-set as one indivisible step:

```sql
BEGIN;
UPDATE seats
   SET status = 'HELD', held_by = :user_id, hold_expires_at = now() + interval '10 minutes'
 WHERE seat_id IN (:ids)                         -- ids sorted ascending to avoid deadlocks
   AND event_id = :event_id
   AND ( status = 'AVAILABLE'
         OR (status = 'HELD' AND hold_expires_at < now()) );   -- expired holds are reusable
-- If rows_updated <> number of seats requested: ROLLBACK and return 409 (all-or-nothing)
COMMIT;
```
When two users update the same row simultaneously, PostgreSQL's row lock makes the second wait until the first commits. It then re-checks the `WHERE` clause, sees the seat is now `HELD`, and updates 0 rows. Exactly one winner, with no application-level locking needed.

### Step 2: Pay (verify, then convert the hold into a sale, in one transaction)
```sql
BEGIN;
SELECT seat_id FROM seats
 WHERE seat_id IN (:ids) AND held_by = :user_id AND status = 'HELD' AND hold_expires_at > now()
 FOR UPDATE;                                       -- lock these rows; need all of them
-- if fewer rows than expected: ROLLBACK -> 410 HOLD_EXPIRED
INSERT INTO orders (...status 'PAID', idempotency_key...) ...;
INSERT INTO tickets (order_id, seat_id, qr_code) ...;     -- UNIQUE(seat_id) enforced here
UPDATE seats SET status = 'SOLD', held_by = NULL, hold_expires_at = NULL WHERE seat_id IN (:ids);
COMMIT;
```
Isolation level: the default READ COMMITTED is enough because every decision is made by a conditional `UPDATE` or `FOR UPDATE` on the specific rows. (SERIALIZABLE would also work but causes many retries under heavy contention.)

### Step 3: The constraint is the safety net
`tickets.seat_id` is `UNIQUE`. If any bug, retry or race ever tries to create a second ticket for the same seat, the database rejects the insert and the whole transaction rolls back. Likewise `orders.idempotency_key UNIQUE` stops duplicate orders from retries, and `UNIQUE(event_id, section, row_label, seat_number)` stops duplicate seats from being created.

### Payment edge cases
- **Charge the card only after a valid hold is confirmed** (check hold, call payment provider with idempotency key, then run the Step 2 transaction).
- If the payment succeeds but the hold expired or the transaction fails: automatic refund (a reconciliation job also scans for `PAID` payments without tickets).
- Expired holds need no cleanup job for correctness (Step 1 reuses them); a background job just resets them to `AVAILABLE` so the seat map is accurate.

---

## 6. Architecture and Surviving the Big Sale

                             +--------------------+
                             |    Client User     |
                             +---------+----------+
                                       |
                   +-------------------+-------------------+
                   | (Static Event Pages)                  | (API & Booking Traffic)
                   v                                       v
         +-------------------+                   +-------------------+
         | Content Delivery  |                   |  Virtual Waiting  |
         |   Network (CDN)   |                   |    Room Queue     |
         +-------------------+                   +---------+---------+
                                                           | (Throttled Flow)
                                                           v
                                                 +-------------------+
                                                 |   Load Balancer   |
                                                 +---------+---------+
                                                           |
                                                           v
                                                 +-------------------+
                                                 |   App Servers     |
                                                 |   (Stateless)     |
                                                 +----+-----+-----+---+
                                                 |      |          |
             +-----------------------------------+      |          +----------------+
             |                                          |                           |
             v                                          v                           v
+----------------------+             +----------------------+    +--------------------+
|Redis Cache           |             |  Primary Database    |    |  Message Queue     |
|(Seat Map State/Holds)|             | (ACID Transactions)  |    |(Expiring Holds)    |
+---------------------+             +------+---------------+     +--------+-----------+
                                           |                              |            v                              v
                             +-------------------+               +--------------------+
                             |   Read Replicas  |                | Background Workers |
                             +------------------+                +--------------------+


### How each part helps during the sale
1. **CDN and caching (speed, protects the database from reads).** Event pages and images are served by the CDN. The seat map is rebuilt from the database about once per second per event and stored in Redis, so 10,000 requests/sec become ~1 database query/sec. Seats may be 1-2 s stale; that is fine because the hold request makes the real decision.
2. **Virtual waiting room (fairness, protects writes).** At on-sale time, users enter a FIFO queue in the order they arrive. A controller admits users in batches (about what the database can process: e.g. 1,000 per minute), giving each a signed, time-limited token needed for seat selection and holds. This turns a spike of 200,000 simultaneous users into a steady flow of ~17/sec, while everyone else sees their queue position. Fair, and it keeps the hot rows from being hammered.
3. **Rate limiting and bot protection.** Per-IP and per-account limits, CAPTCHA at queue entry, one queue entry per account, max 6 seats per order, one active hold per user per event.
4. **Stateless, auto-scaling API servers.** Any server can handle any request, so we add servers before the sale (pre-warmed, since autoscaling is too slow for a 1-minute spike).
5. **Single PostgreSQL primary for seats.** Writes that decide seat ownership go to one primary, which is what makes them correct. With ~33 successful sales/sec and a few hundred hold attempts/sec after the waiting room, one well-indexed primary handles this. Browsing and "my tickets" queries go to read replicas.
6. **Queues for slow work.** Emails, QR generation, refunds and hold cleanup happen asynchronously so checkout stays fast and a slow email provider cannot block sales.
7. **Graceful degradation.** If checkout is overloaded, the waiting room pauses admissions while browsing keeps working. If Redis fails, API servers fall back to read replicas for the seat map.
8. **Sold-out fast path.** When all seats are sold, a flag in Redis lets the API answer "sold out" instantly without touching the database, which handles the other 180,000 disappointed users cheaply.

---

## 7. Trade-offs

| Decision | Benefit | Cost | Why we chose it |
|---|---|---|---|
| **Waiting room (queue) instead of letting everyone in** | Fair; protects the database; predictable latency | Users wait; extra component; some users give up | Waiting 10 minutes is better than a crash or a lottery won by bots |
| **Cached, slightly stale seat map** | Cuts reads on the database by ~99%; fast | A user may click a seat that was just taken and get a 409 | A rejected click is cheap; a wrongly sold seat is not. Correctness is enforced at hold time, not on the map |
| **Single primary SQL database (strong consistency) vs. sharded / eventually consistent NoSQL** | Simple, ACID, easy to reason about; constraints give a hard guarantee | Vertical scaling limit; single point of failure (mitigated by a hot standby) | Peak of ~33 sales/sec is well within one database; correctness matters more than infinite scale. Can shard by `event_id` later |
| **10-minute hold** | Users can finish paying without losing seats | Abandoned holds lock seats others want; longer holds mean fewer visible seats | Shorter (e.g. 5 min) during big sales is a tunable knob |
| **Pessimistic row locks / conditional update vs. optimistic locking** | No wasted work, simple all-or-nothing | Waiting on hot rows; deadlock risk if seat order differs (solved by sorting ids) | Contention is extreme (10 buyers per seat), so optimistic retries would mostly fail and waste work |
| **Asynchronous workers for email and refunds** | Faster checkout; resilient | Delay of seconds before the email; more moving parts | Users can see tickets immediately in the app |

---

## 8. Summary of Assumptions
- Each big-sale user makes about 15 read requests and about 3 hold attempts.
- The busiest hour of a normal day carries about 5x the average load.
- Payment provider handles our payment rate and supports idempotency keys.
- Seat price and seat layout do not change after the event goes on sale.
