# SnapShare: System Architecture & Capacity Analysis

This document outlines the architectural blueprint, capacity estimations, storage strategy, and system trade-offs for **SnapShare**, a high-scale photo-sharing platform.

---

## 1. Assumptions & Daily Active Users (DAU)

### System Baseline
* **Total Registered Users:** 10,000,000 registered users.
* **Daily Active User Rate:** 10% of total registered users log in and interact daily.
* **Per-User Activity:**
  * **Uploads (Writes):** 1 photo upload per active user per day.
  * **Feed Views (Reads):** 50 feed views per active user per day.
* **Asset Payload Sizes:**
  * Original photo file size: 2 MB ($2 \times 10^6$ bytes).
  * Generated thumbnail file size: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Combined storage generated per upload: 2.05 MB.
* **Time Conversion Standard:** 1 day $\approx$ 100,000 seconds (standard system design approximation for 86,400 seconds).

### Daily Active Users (DAU)
$$\text{DAU} = 10,000,000 \text{ registered users} \times 0.10 = \mathbf{1,000,000 \text{ DAU}}$$

---

## 2. Capacity Estimations

### A. Photo Uploads Per Second (Writes)
* **Total Daily Uploads:** $1,000,000 \text{ DAU} \times 1 \text{ photo/day} = 1,000,000 \text{ uploads/day}$.
* **Average Uploads/sec:**
  $$\text{Average Uploads/sec} = \frac{1,000,000 \text{ uploads}}{100,000 \text{ seconds}} = \mathbf{10 \text{ uploads/sec}}$$
* **Peak Uploads/sec ($5\times$ multiplier):**
  $$\text{Peak Uploads/sec} = 10 \text{ uploads/sec} \times 5 = \mathbf{50 \text{ uploads/sec}}$$

### B. Feed Views Per Second (Reads)
* **Total Daily Feed Views:** $1,000,000 \text{ DAU} \times 50 \text{ feed views/day} = 50,000,000 \text{ views/day}$.
* **Average Feed Views/sec:**
  $$\text{Average Feed Views/sec} = \frac{50,000,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{500 \text{ views/sec}}$$
* **Peak Feed Views/sec ($5\times$ multiplier):**
  $$\text{Peak Feed Views/sec} = 500 \text{ views/sec} \times 5 = \mathbf{2,500 \text{ views/sec}}$$

### C. Photo Storage Per Year
* **Daily Storage Added:**
  $$\text{Daily Storage} = 1,000,000 \text{ uploads} \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = \mathbf{2.05 \text{ TB/day}}$$
* **Yearly Storage Requirement:**
  $$\text{Yearly Storage} = 2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. Workload Profile & System Design Implications

SnapShare is a **read-heavy system**, operating at a **50:1 Read-to-Write ratio** (500 feed views/sec vs. 10 uploads/sec).

### Design Implications:
1. **Aggressive Multi-Tier Caching:** Caches static images at geographically edge-distributed CDNs, and holds dynamic feed responses in memory (Redis) to bypass the primary database.
2. **Database Read Offloading:** Read queries are routed to dedicated Database Read Replicas, isolating the Primary Relational Database so it strictly handles transactional writes.
3. **Decoupled Asynchronous Writes:** High-overhead background write workloads, such as photo resizing and thumbnail rendering, are offloaded to message queues to keep upload endpoints fast and responsive.

---

## 4. Storage Strategy: Why Photos Do Not Belong inside the Database

### Problems with Storing Binary Files in Relational Databases:
* **Database Bloat & Memory Saturation:** Storing Binary Large Objects (BLOBs) inflates database table sizes, exhausts RAM buffer pools meant for row indexes, and degrades overall query execution speeds.
* **Backup & Replication Strain:** Massive binary files slow down database table scans, full system backups, point-in-time restores, and cross-region replication streams.

### Storage Solution:
Unstructured binary photo files are stored in **Object Storage** (e.g., AWS S3, Cloudflare R2, or MinIO), which is horizontally scalable, highly durable, and cost-effective. The relational database stores only lightweight metadata and text string object URLs (e.g., `https://cdn.snapshare.com/photos/2026/img_1001.jpg`).

---

## 5. System Architecture Diagram

                             +--------------------+
                             |     Client User    |
                             +---------+----------+
                                       |
                      +--------------------+-----------------------------+
                      |(Static Photos/Thumbnails)           |(Dynamic API 
                      |                                     |  Requests)      
                      v                                     v
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
                    |     |                           |               |   
                    v     v                           v               v
                +----------------+        +--------------+      +---------------+
                | Object Storage |         | Cache Layer |      | Message Queue  |
                |(e.g., AWS S3)  |         |(Redis Cache)|      |(e.g., RabbitMQ)|
                +----------------+         +-------------+      +----------------+
                    ^                                                      |
                    |                                                      v
                    |                                        +-------------------+
                    |                                        |  Worker Engine    |
                    +-------------------------------------+|(Thumbnail Generator)|
                                                            +--------------------+
                                                                                         
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

## 6. Component Explanations

* **CDN (Content Delivery Network):** Caches and serves static full-size photos and thumbnails from edge locations close to users to reduce retrieval latency and origin bandwidth.
* **Load Balancer:** Distributes incoming network traffic evenly across stateless application servers to maintain application availability and prevent single-server bottlenecks.
* **Stateless App Servers:** Processes incoming HTTP user requests, manages authentication, and coordinates business logic without retaining session state on local hardware.
* **Cache Layer (Redis):** Stores pre-computed feed timelines and active user sessions in memory for sub-millisecond retrieval.
* **Primary Database (Writes):** Handles relational database write operations and guarantees transactional ACID compliance for user accounts, post metadata, and follower relationships.
* **Read Replica Database:** Replicates data asynchronously from the primary database to serve feed query reads without burdening the primary write node.
* **Object Storage (AWS S3):** Holds unstructured binary image data and thumbnails in a scalable, highly durable file repository.
* **Message Queue (RabbitMQ):** Holds asynchronous background processing tasks so that intensive media workloads do not block HTTP client upload responses.
* **Worker Engine:** Pulls thumbnail rendering jobs from the message queue, resizes raw images to 50 KB thumbnails, saves them to Object Storage, and updates post metadata.

---

## 7. Step-by-Step Photo Upload Flow

1. **Upload Request:** The user's device sends an HTTP `POST` request containing raw 2 MB photo binary data and metadata to the API endpoint.
2. **Traffic Load Balancing:** The Load Balancer intercepts the incoming request and routes it to an available stateless App Server instance.
3. **Persist Raw Photo:** The App Server streams the 2 MB raw photo directly into Object Storage (AWS S3) and receives back a unique object key/URL.
4. **Persist Metadata:** The App Server records the post metadata (User ID, timestamp, raw image URL) into the Primary Database.
5. **Enqueue Task & Quick HTTP Response:** The App Server emits a `generate_thumbnail` task onto the Message Queue and immediately sends an HTTP `201 Created` response back to the client.
6. **Async Thumbnail Processing:** A background Worker Engine retrieves the task from the queue, downloads the raw photo, resizes it down to a 50 KB thumbnail, uploads the thumbnail to Object Storage, and attaches the `thumbnail_url` to the post record in the database.
7. **Cache Invalidation:** The Worker Engine or App Server invalidates or updates the affected follower feed caches in Redis so followers see the updated post and thumbnail on their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Processing vs. Instant Thumbnail Availability:**
   * *Trade-off:* Moving thumbnail creation to a background message queue keeps HTTP upload response times fast and non-blocking for the uploader. However, during high-traffic spikes, message queue backlogs may cause followers to briefly view a post before its thumbnail finish rendering (eventual consistency).
2. **Pre-computed Feed Caching vs. Fan-out Write Amplification:**
   * *Trade-off:* Pre-computing follower feeds into Redis on post creation allows instantaneous $O(1)$ read performance for timeline queries. However, when high-profile accounts ("celebrities") post a photo, it triggers a massive write spike across thousands of follower feed caches simultaneously.

---

## 9. Git Execution Commands

To save, commit, and push your work to your remote GitHub repository, run the following commands in your terminal:

```bash
# Navigate to repository root directory
cd web-foundations-days

# Ensure day7 directory exists
mkdir -p day7

# Stage the file
git add day7/photo-app-scaling.md

# Commit with the exact required commit message
git commit -m "Day 7 assignment"

# Push to the remote main branch
git push origin main


<FollowUp label="Want to inspect how to handle celebrity fan-out writes in Redis?" query="How can we optimize celebrity fan-out writes in a read-heavy photo application?"/>