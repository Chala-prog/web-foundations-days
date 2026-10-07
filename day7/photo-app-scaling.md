# SnapShare: System Architecture & Scaling Analysis

This document outlines the system architecture, capacity planning, storage strategy, and architectural trade-offs for **SnapShare**, a high-scale photo-sharing application.

---

## 1. Assumptions & Daily Active Users (DAU)

### Assumptions
* **Total Registered Users:** 10,000,000 users.
* **Active User Rate:** 10% of total registered users log in daily.
* **Daily User Behavior:**
  * **Uploads (Writes):** Each DAU uploads 1 photo per day.
  * **Feed Views (Reads):** Each DAU views their feed 50 times per day.
* **Payload Sizes:**
  * Original photo file: 2 MB ($2 \times 10^6$ bytes).
  * Thumbnail photo file: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Combined storage per upload: 2.05 MB.
* **Time Scale Standard:** 1 day $\approx$ 100,000 seconds (rounded from 86,400s for standard system design estimations).

### Daily Active Users Calculation
$$\text{DAU} = 10,000,000 \text{ registered users} \times 0.10 = \mathbf{1,000,000 \text{ DAU}}$$

---

## 2. Capacity Estimations

### A. Uploads Per Second (Writes)
* **Total Daily Uploads:** $1,000,000 \text{ DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$.
* **Average Uploads Per Second:**
  $$\frac{1,000,000 \text{ uploads}}{100,000 \text{ seconds}} = \mathbf{10 \text{ uploads/second}}$$
* **Peak Uploads Per Second ($5\times$ multiplier):**
  $$10 \times 5 = \mathbf{50 \text{ uploads/second}}$$

### B. Feed Views Per Second (Reads)
* **Total Daily Feed Views:** $1,000,000 \text{ DAU} \times 50 \text{ views/day} = 50,000,000 \text{ views/day}$.
* **Average Feed Views Per Second:**
  $$\frac{50,000,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{500 \text{ views/second}}$$
* **Peak Feed Views Per Second ($5\times$ multiplier):**
  $$500 \times 5 = \mathbf{2,500 \text{ views/second}}$$

### C. Photo Storage Per Year
* **Daily Storage Added:**
  $$1,000,000 \text{ uploads} \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = \mathbf{2.05 \text{ TB/day}}$$
* **Yearly Storage Requirement:**
  $$2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. Workload Profile & Architectural Implications

SnapShare is heavily **read-heavy**, operating at a **50:1 Read-to-Write ratio** (500 feed views/sec vs. 10 uploads/sec).

### Design Implications:
1. **Aggressive Edge & Memory Caching:** The system must heavily rely on CDNs for static media files (photos/thumbnails) and Redis in-memory caches for dynamic feed timelines to prevent traffic from hitting application databases.
2. **Database Read Offloading:** Read queries must be offloaded to Database Read Replicas and memory caches so the Primary Relational Database handles only transactional writes (metadata inserts, user updates).
3. **Decoupled Asynchronous Processing:** Upload flows should quickly store raw images and enqueue heavy background work (thumbnail creation) so API servers remain fast and available for read operations.

---

## 4. Why Photos Must NOT Live in the Database

* **Database Bloat & RAM Contamination:** Storing large binary objects (BLOBs) directly inside relational databases bloats table sizes, fragments disk storage, and consumes precious RAM buffer pools meant for indexing database rows.
* **Degraded Backup & Query Performance:** Large binary objects severely slow down full database backups, restore times, replication lag, and index scans.
* **Where They Belong Instead:** Binary photo assets belong in dedicated **Object Storage** (e.g., AWS S3, Cloudflare R2, or MinIO), which is horizontally scalable, highly durable, and cost-effective for unstructured binary data. The database stores only lightweight string pointers (URLs) to those assets.

---
## 5. System Architecture Diagram

                             +--------------------+
                             |     Client User    |
                             +---------+----------+
                                       |
               +-------------------+-----------------------+
               |(Static Photos/Thumbnails)                 |(Dynamic API 
               |                                           |   Requests)      
               v                                           v
         +-------------------+                   +-------------------+
         | Content Delivery  |                   |   Load Balancer   |
         |   Network (CDN)   |                   +---------+---------+
         +---------+---------+                             |
                |                                          v
                |                          +----------------------+
                |                          |    App Servers       |
                |                          |    (Stateless)       |
                |                          +------+-----+-----+---+
                |                          |      |      |
                |     +--------------------+      |      +----------------+
                |     |                           |                       |  
                v     v                           v                       v
      +-------------------+        +----------------+      +------------------+
      |  Object Storage  |         | Cache Layer    |      | Message Queue    |
      | (e.g., AWS S3)   |         | (Redis Cache)  |      | (e.g., RabbitMQ) |+---------+---------+        +----------------+      +------------------+
               ^                                                     |  
               |                                                     v
               |                                        +---------------------+
               |                                        |   Worker Engine     |
               +---------------------------------------+|(Thumbnail Generator)|
                                                        +---------------------+
                                                                                         
                                   +-------------------+
                                   |  Primary Database |
                                   |      (Writes)     |
                                   +---------+---------+
                                             |
                                             | (Replication)
                                             v
                                    +-------------------+
                                    |   Read Replica    |
                                    |      (Reads)      |
                                    +-------------------+
 ---

## 6. Component Responsibilities

* **CDN (Content Delivery Network):** Serves cached static photo assets and thumbnails directly to users from edge servers physically closest to them to minimize latency and origin bandwidth.
* **Load Balancer:** Evenly spreads incoming HTTP API traffic across a cluster of stateless application servers to ensure high availability and prevent single-server bottlenecks.
* **Stateless App Servers:** Executes core application logic, authenticates user requests, and serves API queries without storing local session state on the server.
* **Cache Layer (Redis):** Stores pre-computed user feeds and frequent database query responses in memory for ultra-fast, sub-millisecond retrieval.
* **Primary Database (Writes):** Handles all transactional write operations (user registrations, post metadata, user follow graphs) to maintain strict data consistency.
* **Read Replica Database:** Continuously mirrors the primary database to serve read queries and offload read stress from the primary write node.
* **Object Storage (AWS S3):** Provides durable, scalable, and cost-effective cloud storage for binary image files and generated thumbnails.
* **Message Queue (RabbitMQ):** Holds asynchronous task messages so client HTTP uploads complete immediately without blocking on image processing steps.
* **Worker Engine:** Fetches thumbnail creation tasks from the message queue, resizes raw images down to 50 KB thumbnails, uploads them to Object Storage, and updates database records.

---

## 7. Step-by-Step Upload Flow

1. **Upload Request:** The client app submits a photo upload request with the original 2 MB photo file and metadata.
2. **Load Balancing:** The Load Balancer receives the request and forwards it to an available stateless App Server.
3. **Persist Raw Image:** The App Server writes the 2 MB raw photo directly to Object Storage and receives a unique object key/URL.
4. **Write Metadata:** The App Server writes a record to the Primary Database containing photo ID, user ID, timestamp, and original photo URL.
5. **Enqueue Task & Quick Response:** The App Server places a `generate_thumbnail` task onto the Message Queue and immediately returns an HTTP `201 Created` response back to the client.
6. **Async Thumbnail Processing:** A background Worker Engine picks up the job from the queue, downloads the original image, generates a 50 KB thumbnail, uploads it to Object Storage, and updates the database row with the `thumbnail_url`.
7. **Cache Invalidation/Update:** The Worker Engine or App Server updates or invalidates the relevant follower feed caches in Redis so followers see the new post and thumbnail on their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Thumbnail Job vs. Instant Visibility:**
   * *Trade-off:* Offloading thumbnail generation to a background queue keeps API upload responses nearly instantaneous. However, if the worker queue accumulates a delay during peak traffic, followers might briefly see a feed post before its thumbnail finishes rendering (eventual consistency).
2. **Pre-computed Feeds vs. Fan-out Write Costs:**
   * *Trade-off:* Pre-computing follower feeds into Redis upon post submission provides ultra-fast $O(1)$ feed read times. However, when high-follower accounts ("celebrity fan-out") post, it causes a spike in simultaneous write operations across thousands of Redis cache keys.