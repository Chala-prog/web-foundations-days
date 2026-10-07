# SnapShare: System Architecture & Capacity Analysis

This document provides a comprehensive system architecture design, capacity planning, storage strategy, and architectural trade-off analysis for **SnapShare**, a high-scale photo-sharing application.

---

## 1. Assumptions & Daily Active Users (DAU)

### Key Assumptions
* **Total Registered Users:** 10,000,000 registered users.
* **Active User Rate:** 10% of total registered users log in and interact daily.
* **Daily User Activity:**
  * **Uploads (Writes):** 1 photo upload per DAU per day.
  * **Feed Views (Reads):** 50 feed views per DAU per day.
* **Payload Sizes:**
  * Original photo file size: 2 MB ($2 \times 10^6$ bytes).
  * Generated thumbnail file size: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Total combined storage per upload: 2.05 MB.
* **Time Conversion Standard:** 1 day $\approx$ 100,000 seconds (standard system design approximation for 86,400 seconds).

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
1. **Aggressive Multi-Layer Caching:** Edge CDNs must serve static image assets, while in-memory caches (Redis) handle dynamic feed query responses.
2. **Database Read Offloading:** Read queries are routed to Database Read Replicas and in-memory caches so the Primary Relational Database only processes write transactions (photo metadata, follow relationships).
3. **Decoupled Asynchronous Processing:** Heavy write tasks like photo resizing and thumbnail generation are offloaded to background message queues to keep API servers responsive.

---

## 4. Storage Strategy: Why Photos Belong Outside the Database

* **Database Bloat & Memory Saturation:** Storing raw binary files (BLOBs) inside relational databases bloats table sizes, fragments disk storage, and exhausts RAM buffer pools meant for row indexing.
* **Degraded Backup & Query Performance:** Large binary objects severely slow down database table scans, full backups, point-in-time restores, and replication streams.
* **Where They Belong Instead:** Unstructured binary photo files belong in dedicated **Object Storage** (e.g., AWS S3, Cloudflare R2, or MinIO), which is horizontally scalable, highly durable, and cost-effective. The relational database stores only lightweight metadata and text string URLs pointing to the objects.

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

* **CDN (Content Delivery Network):** Caches and delivers static photo assets and thumbnails to end users from edge locations physically close to them, reducing response latency and origin traffic.
* **Load Balancer:** Distributes incoming application traffic evenly across multiple stateless application servers to maintain system availability and prevent single-server bottlenecks.
* **Stateless App Servers:** Handles application logic, authentication, and user API requests without storing session state on individual web servers.
* **Cache Layer (Redis):** Stores pre-computed user feed timelines and frequent query results in memory for sub-millisecond retrieval speeds.
* **Primary Database (Writes):** Manages transactional write requests and ensures ACID compliance for structured relational data like user accounts, post metadata, and follower graphs.
* **Read Replica Database:** Replicates data asynchronously from the primary database to handle read-heavy queries without overloading the primary write instance.
* **Object Storage (AWS S3):** Provides scalable, durable, and low-cost storage specifically optimized for unstructured binary data such as full-size photos and thumbnails.
* **Message Queue (RabbitMQ):** Holds background jobs asynchronously so image processing tasks do not slow down client HTTP upload response times.
* **Worker Engine:** Pulls thumbnail jobs from the queue, resizes original images down to 50 KB thumbnails, uploads them to Object Storage, and updates database records.

---

## 7. Step-by-Step Upload Flow

1. **Upload Request:** The client application submits an HTTP `POST` request containing the 2 MB raw photo file and metadata to the API endpoint.
2. **Load Balancing:** The Load Balancer receives the request and routes it to an available stateless App Server instance.
3. **Persist Raw Image:** The App Server streams the 2 MB raw photo file directly into Object Storage and receives a unique object key/URL.
4. **Write Metadata:** The App Server writes a post record containing user ID, upload timestamp, and the raw image URL to the Primary Database.
5. **Enqueue Task & Quick Response:** The App Server pushes a `generate_thumbnail` task onto the Message Queue and immediately sends an HTTP `201 Created` response back to the client.
6. **Async Thumbnail Processing:** A background Worker Engine retrieves the task from the queue, downloads the raw photo, resizes it to a 50 KB thumbnail, uploads the thumbnail to Object Storage, and saves the `thumbnail_url` in the database.
7. **Cache Update/Invalidation:** The Worker Engine or App Server invalidates or updates affected follower feed caches in Redis so followers see the updated post and thumbnail on their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Thumbnail Processing vs. Instant Thumbnail Availability:**
   * *Trade-off:* Offloading thumbnail generation to background message queue workers keeps API upload response times fast and non-blocking for the uploader. However, if the worker queue experiences a backlog during traffic spikes, followers may briefly view a post before its thumbnail has finished rendering (eventual consistency).
2. **Pre-computed Feeds vs. Fan-out Write Cost:**
   * *Trade-off:* Pre-computing follower feeds into Redis on post creation enables sub-millisecond $O(1)$ feed reads. However, when accounts with large follower counts ("celebrity fan-out") publish a photo, it triggers a massive write spike across thousands of follower Redis cache keys simultaneously.

---

## 9. Commit and Push Instructions

Save this file into `day7/photo-app-scaling.md` and execute the following commands in your terminal:

```bash
mkdir -p day7
git add day7/photo-app-scaling.md
git commit -m "Day 7 assignment"
git push origin main


<FollowUp label="Want to inspect how to handle celebrity fan-out writes in Redis?" query="How can we optimize celebrity fan-out writes in a read-heavy photo application?"/>