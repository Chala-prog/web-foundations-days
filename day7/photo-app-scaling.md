# SnapShare: System Architecture & Scaling Plan

This document details the high-level system architecture, capacity estimations, object storage design, and operational trade-offs for **SnapShare**, a photo-sharing application.

---

## 1. Assumptions & Daily Active Users (DAU)

* **Total Registered Users:** 10,000,000 users.
* **Active User Rate:** 10% of total registered users active daily.
* **Daily Active Users (DAU):** $10,000,000 \times 0.10 = \mathbf{1,000,000 \text{ DAU}}$.
* **Upload Activity:** 1 photo per active user per day.
* **Feed Activity:** 50 feed page views per active user per day.
* **Payload Sizes:**
  * Original photo file: 2 MB ($2 \times 10^6$ bytes).
  * Thumbnail photo file: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Combined storage per upload: 2.05 MB.
* **Time Scale Estimation:** 1 day $\approx$ 100,000 seconds (exact standard: 86,400 seconds; rounded to 100,000s for system design estimations).

---

## 2. Capacity Estimations

### A. Uploads Per Second (Writes)
* **Total Daily Uploads:** $1,000,000 \text{ uploads/day}$.
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
  $$1,000,000 \text{ uploads} \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = 2.05 \text{ TB/day}$$
* **Yearly Storage Requirement:** 
  $$2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. Workload Profile & Architectural Implications

SnapShare is heavily **read-heavy**, operating at a **50:1 Read-to-Write ratio** (500 feed views/sec vs. 10 uploads/sec).

### Implications for Design:
1. **Aggressive Edge Caching:** Dynamic feed data and static photo assets must be cached extensively using CDNs and Redis layers to prevent request flooding on origin servers.
2. **Database Read Offloading:** The primary relational database must only process write queries (metadata inserts, user relationship writes). All read traffic is served by Read Replicas and in-memory caches.
3. **Asynchronous Write Pipeline:** Photo processing and thumbnail generation must be decoupled from the main request-response lifecycle using background message queues.

---

## 4. Why Photos Must NOT Live in the Database

* **Bloat & Memory Saturation:** Storing large binary BLOBs directly in relational databases causes rapid disk fragmentation and exhausts database buffer pools, reducing RAM available for indexing.
* **Backup & Performance Degradation:** Large binaries inflate database size, slowing down query execution times, full-table scans, and automated database backups.
* **Where They Belong Instead:** Binary photo assets belong in dedicated **Object Storage** (e.g., AWS S3, MinIO, or Cloudflare R2), which is designed for durable, scalable, and low-cost storage of unstructured binary objects. The relational database stores only the lightweight string URLs pointing to those stored objects.

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
                |     +--------------------+      |      +-----------+
                |     |                           |                  |  
                v     v                           v                  v
      +-------------------+        +----------------+    +------------------+
      |  Object Storage  |         | Cache Layer    |    | Message Queue    |
      | (e.g., AWS S3)   |         | (Redis Cache)  |    |(e.g., RabbitMQ)  | +---------+---------+        +----------------+    +--------+---------+
               ^                                                  |            |                                                  v
               |                                      +---------------------+
               |                                      |   Worker Engine     |
               +-------------------------------------+|(Thumbnail Generator)|
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

* **CDN (Content Delivery Network):** Caches and delivers static photo assets and thumbnails from edge locations physically close to the user to reduce load times and origin bandwidth.
* **Load Balancer:** Evenly distributes incoming HTTP API requests across a cluster of app servers to maintain high availability and prevent single-point overload.
* **Stateless App Servers:** Handles application logic, authentication, and feed queries without storing user session state on local server memory.
* **Cache Layer (Redis):** Stores pre-computed user feeds and frequent database query responses in memory for ultra-fast, low-latency access.
* **Primary Database (Writes):** Processes all transactional write operations (user accounts, photo metadata, follow graphs) to ensure relational consistency.
* **Read Replica Database:** Continuously mirrors the primary database to handle read queries and offload read pressure from the primary write node.
* **Object Storage (AWS S3):** Provides scalable, durable, and highly cost-effective cloud storage for binary image files and thumbnails.
* **Message Queue (RabbitMQ):** Holds asynchronous background processing tasks so client HTTP uploads complete immediately without waiting for image resizes.
* **Worker Engine:** Fetches thumbnail creation tasks from the message queue, resizes original images down to 50 KB thumbnails, and uploads them back to Object Storage.

---

## 7. Step-by-Step Upload Flow

1. **Upload Initiation:** The user submits a photo upload request via the client mobile/web app containing the original 2 MB photo file and post metadata.
2. **Load Balancing:** The Load Balancer receives the request and routes it to an available stateless App Server.
3. **Object Storage Persist:** The App Server writes the 2 MB raw photo directly to Object Storage and receives a unique object key/URL.
4. **Metadata Insert:** The App Server inserts a row into the Primary Database containing the photo ID, user ID, upload timestamp, and original photo Object Storage URL.
5. **Enqueue Job & Quick Response:** The App Server places a `generate_thumbnail` job containing `photo_id` and `object_url` onto the Message Queue, and immediately returns a `201 Created` HTTP response back to the client.
6. **Async Thumbnail Worker Execution:** A background Worker Engine picks up the job from the queue, downloads the 2 MB photo, creates a 50 KB thumbnail version, uploads the thumbnail to Object Storage, and updates the database record with the `thumbnail_url`.
7. **Cache Update/Invalidation:** The Worker Engine or App Server updates or invalidates the relevant follower feed caches in Redis so followers see the updated post with its thumbnail on their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Processing vs. Instant Thumbnail Visibility:**
   * *Trade-off:* Offloading thumbnail generation to a background queue makes photo uploads instant for the uploader. However, if the worker queue experiences a sudden backlog, followers might briefly see a post in their feed before its thumbnail has finished rendering (eventual consistency).
2. **Pre-computed Feeds vs. Fan-out Query Costs:**
   * *Trade-off:* Pre-computing and storing follower feeds in Redis during photo upload makes feed page loads super fast ($O(1)$ read time). However, this increases write operations and Redis memory consumption whenever high-follower accounts post photos (the "celebrity fan-out" problem).                                               