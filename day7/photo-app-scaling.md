# SnapShare: System Architecture & Scaling Analysis

This document provides a system architecture and capacity analysis for **SnapShare**, a high-scale photo-sharing web application.

---

## 1. Assumptions & Daily Active Users (DAU)

### Key Assumptions
* **Total Registered Users:** 10,000,000 users.
* **Active User Rate:** 10% of total registered users log in and engage daily.
* **Daily User Activity:**
  * **Uploads (Writes):** 1 photo upload per DAU per day.
  * **Feed Views (Reads):** 50 feed views per DAU per day.
* **Payload Sizes:**
  * Original photo file size: 2 MB ($2 \times 10^6$ bytes).
  * Generated thumbnail file size: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Total combined storage per upload: 2.05 MB.
* **Time Conversion Standard:** 1 day $\approx$ 100,000 seconds (rounded from 86,400 seconds for standard system design estimations).

### Daily Active Users (DAU) Calculation
$$\text{DAU} = 10,000,000 \text{ registered users} \times 0.10 = \mathbf{1,000,000 \text{ DAU}}$$

---

## 2. Capacity Estimations

### A. Uploads Per Second (Writes)
* **Total Daily Uploads:** $1,000,000 \text{ DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$.
* **Average Uploads Per Second:**
  $$\text{Average Uploads/sec} = \frac{1,000,000 \text{ uploads}}{100,000 \text{ seconds}} = \mathbf{10 \text{ uploads/sec}}$$
* **Peak Uploads Per Second ($5\times$ multiplier):**
  $$\text{Peak Uploads/sec} = 10 \text{ uploads/sec} \times 5 = \mathbf{50 \text{ uploads/sec}}$$

### B. Feed Views Per Second (Reads)
* **Total Daily Feed Views:** $1,000,000 \text{ DAU} \times 50 \text{ feed views/day} = 50,000,000 \text{ views/day}$.
* **Average Feed Views Per Second:**
  $$\text{Average Views/sec} = \frac{50,000,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{500 \text{ views/sec}}$$
* **Peak Feed Views Per Second ($5\times$ multiplier):**
  $$\text{Peak Views/sec} = 500 \text{ views/sec} \times 5 = \mathbf{2,500 \text{ views/sec}}$$

### C. Photo Storage Per Year
* **Daily Storage Added:**
  $$\text{Daily Storage} = 1,000,000 \text{ uploads} \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = \mathbf{2.05 \text{ TB/day}}$$
* **Yearly Storage Requirement:**
  $$\text{Yearly Storage} = 2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. Workload Profile & Architectural Implications

SnapShare is **read-heavy**, operating at a **50:1 Read-to-Write ratio** (500 feed views/sec vs. 10 uploads/sec).

### Implications for System Design:
1. **Aggressive Multi-Layer Caching:** Utilize Content Delivery Networks (CDNs) to serve static photo assets and thumbnails directly from edge servers, and use Redis caches for dynamic user feed timelines.
2. **Database Read Offloading:** Route read queries to Database Read Replicas and in-memory caches so the Primary Relational Database only handles transactional writes (photo metadata, follow relationships).
3. **Decoupled Asynchronous Writes:** Decouple photo processing (resizing, thumbnails) from client request-response cycles using background job queues to keep application servers responsive.

---

## 4. Storage Strategy: Why Photos Belong Outside the Database

* **Database Bloat & Memory Saturation:** Storing large binary objects (BLOBs) inside relational databases bloats tables, fragments disk storage, and exhausts RAM buffer pools meant for indexing rows.
* **Degraded Backup & Query Performance:** Large binaries significantly slow down table scans, full database backups, restore operations, and replication lag between primary and replica nodes.
* **Where They Go Instead:** Raw binary photo assets belong in dedicated **Object Storage** (e.g., AWS S3, Cloudflare R2, or MinIO), which is horizontally scalable, highly durable, and cost-effective for unstructured binary objects. The relational database stores only lightweight string URLs pointing to those assets.

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
      | (e.g., AWS S3)   |         | (Redis Cache)  |      | (e.g., RabbitMQ )|
      +------------------+         +----------------+      +------------------+
               ^                                                      |
               |                                                      v
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

* **CDN (Content Delivery Network):** Serves cached static photo assets and thumbnails directly to users from edge servers physically close to them, reducing latency and origin bandwidth.
* **Load Balancer:** Evenly distributes incoming HTTP API request traffic across a cluster of stateless application servers to maintain high availability and prevent single-point overload.
* **Stateless App Servers:** Executes core application logic, handles user authentication, and serves API requests without storing local session state on the server.
* **Cache Layer (Redis):** Stores pre-computed user feeds and frequent database query responses in memory for ultra-fast, sub-millisecond retrieval times.
* **Primary Database (Writes):** Processes all transactional write operations (user profiles, photo metadata, follow graphs) to guarantee relational consistency.
* **Read Replica Database:** Continuously synchronizes with the primary database to handle read-only queries and offload read pressure from the primary write node.
* **Object Storage (AWS S3):** Provides scalable, durable, and highly cost-effective cloud storage for unstructured binary image files and generated thumbnails.
* **Message Queue (RabbitMQ):** Holds asynchronous background processing tasks so client HTTP requests complete immediately without waiting for heavy image transformations.
* **Worker Engine:** Fetches thumbnail creation tasks from the message queue, resizes raw images down to 50 KB thumbnails, uploads them to Object Storage, and updates database records.

---

## 7. Step-by-Step Upload Flow

1. **Upload Request:** The client application submits a photo upload request containing the original 2 MB photo file and post metadata.
2. **Load Balancing:** The Load Balancer receives the request and forwards it to an available stateless App Server.
3. **Persist Raw Image:** The App Server writes the 2 MB raw photo directly to Object Storage and receives a unique object key/URL.
4. **Write Metadata:** The App Server writes a record to the Primary Database containing photo ID, user ID, upload timestamp, and original photo Object Storage URL.
5. **Enqueue Task & Quick Response:** The App Server places a `generate_thumbnail` task onto the Message Queue and immediately returns an HTTP `201 Created` response back to the client.
6. **Async Thumbnail Processing:** A background Worker Engine fetches the job from the queue, downloads the raw image, creates a 50 KB thumbnail version, uploads the thumbnail to Object Storage, and updates the database record with the `thumbnail_url`.
7. **Cache Invalidation/Update:** The Worker Engine or App Server updates or invalidates the relevant follower feed caches in Redis so followers see the updated post and thumbnail on their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Processing vs. Instant Thumbnail Availability:**
   * *Trade-off:* Offloading thumbnail generation to a background queue keeps API upload response times nearly instantaneous for the uploader. However, if the worker queue experiences a backlog during peak traffic hours, followers might briefly see a post before its thumbnail has finished rendering (eventual consistency).
2. **Pre-computed Feeds vs. Fan-out Write Costs:**
   * *Trade-off:* Pre-computing follower feeds into Redis upon post creation yields ultra-fast $O(1)$ feed load times. However, when high-follower accounts ("celebrity fan-out") post photos, it triggers a massive write spike across thousands of follower Redis cache keys simultaneously.

   ---

## 9. Commit and Push Instructions

Run the following commands in your repository root terminal:

```bash
mkdir -p day7
# Save this file to day7/photo-app-scaling.md
git add day7/photo-app-scaling.md
git commit -m "Day 7 assignment"
git push origin main