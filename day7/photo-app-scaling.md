# SnapShare: Scalable Photo Application System Architecture

---

## 1. Assumptions & Daily Active Users (DAU)

### Key System Assumptions
* **Total Registered Users:** 10,000,000 registered users.
* **Active User Conversion:** 10% of total users log in and interact daily.
* **User Behavior Profile:**
  * **Photo Uploads:** 1 upload per active user per day.
  * **Feed Views:** 50 feed views per active user per day.
* **Payload Sizes:**
  * Original photo size: 2 MB ($2 \times 10^6$ bytes).
  * Generated thumbnail size: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Total stored payload per upload: 2.05 MB.
* **Time Conversion Standard:** 1 day $\approx$ 100,000 seconds (standard system design approximation for 86,400 seconds).

### Daily Active Users (DAU) Calculation
$$\text{DAU} = 10,000,000 \text{ registered users} \times 0.10 = \mathbf{1,000,000 \text{ DAU}}$$

---

## 2. Capacity Estimations

### A. Uploads Per Second (Writes)
* **Total Daily Uploads:** $1,000,000 \text{ DAU} \times 1 \text{ photo/day} = 1,000,000 \text{ uploads/day}$.
* **Average Uploads Per Second:**
  $$\text{Average Uploads/sec} = \frac{1,000,000 \text{ uploads}}{100,000 \text{ seconds}} = \mathbf{10 \text{ uploads/sec}}$$
* **Peak Uploads Per Second ($5\times$ multiplier):**
  $$\text{Peak Uploads/sec} = 10 \text{ uploads/sec} \times 5 = \mathbf{50 \text{ uploads/sec}}$$

### B. Feed Views Per Second (Reads)
* **Total Daily Feed Views:** $1,000,000 \text{ DAU} \times 50 \text{ views/day} = 50,000,000 \text{ views/day}$.
* **Average Feed Views Per Second:**
  $$\text{Average Views/sec} = \frac{50,000,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{500 \text{ views/sec}}$$
* **Peak Feed Views Per Second ($5\times$ multiplier):**
  $$\text{Peak Views/sec} = 500 \text{ views/sec} \times 5 = \mathbf{2,500 \text{ views/sec}}$$

### C. Photo Storage Capacity Per Year
* **Daily Storage Generated:**
  $$\text{Daily Storage} = 1,000,000 \text{ uploads} \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = \mathbf{2.05 \text{ TB/day}}$$
* **Yearly Storage Generation:**
  $$\text{Yearly Storage} = 2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. Workload Profile & System Design Implications

SnapShare is a **read-heavy system**, operating at a **50:1 Read-to-Write ratio** (500 feed views/sec vs. 10 uploads/sec).

### Architectural Design Implications:
1. **Multi-Layer Caching:** Static image files must be heavily cached at edge CDNs, while dynamic timeline responses are cached in memory using Redis to avoid touching the primary database.
2. **Database Scaling & Read Replicas:** Read traffic is offloaded to Database Read Replicas so the Primary Relational Database handles only transactional writes (uploads, followers, metadata updates).
3. **Asynchronous Write Pipeline:** Resource-intensive write tasks, such as photo rendering and thumbnail generation, are deferred to background worker queues to prevent blocking API responses.

---

## 4. Photo Storage Strategy: Why Binary Files Do Not Belong in Databases

### Problems with Storing Photos in a Database:
* **Database Bloat & Memory Saturation:** Binary Large Objects (BLOBs) inflate database page sizes, exhaust RAM buffer pools meant for row indexes, and drastically degrade query performance.
* **Backup & Replication Friction:** Massive binary data makes full database backups, point-in-time restores, and cross-region replication extremely slow and expensive.

### Correct Storage Architecture:
Unstructured binary objects belong in **Object Storage** (e.g., AWS S3, Cloudflare R2, or MinIO), which provides horizontally scalable, low-cost file storage. The relational database stores only lightweight metadata and text string object URLs (e.g., `https://cdn.snapshare.com/photos/2026/img_12345.jpg`).

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

## 6. Component Explanations

* **CDN (Content Delivery Network):** Caches and serves static full-size photos and thumbnails from geographically distributed edge locations to minimize retrieval latency for end users.
* **Load Balancer:** Distributes incoming API traffic evenly across multiple stateless application servers to optimize resource utilization and prevent single-point congestion.
* **Stateless App Servers:** Processes incoming HTTP requests, handles authentication, routes transactions, and coordinates storage streams without maintaining local session state.
* **Cache Layer (Redis):** Stores pre-computed user feed timelines and hot data in memory to satisfy read queries in sub-milliseconds.
* **Primary Database (Writes):** Manages user profiles, post metadata, and follower graphs while guaranteeing transactional ACID compliance for write operations.
* **Read Replica Database:** Asynchronously replicates data from the primary database to handle feed query reads without burdening the primary write node.
* **Object Storage (AWS S3):** Scalable storage system engineered to store unstructured binary objects like raw photos and generated thumbnails.
* **Message Queue (RabbitMQ):** Decouples upload handling from background tasks by buffering thumbnail generation jobs.
* **Worker Engine:** Consumes jobs from the message queue, resizes original photos into 50 KB thumbnails, stores them in Object Storage, and updates post metadata.

---

## 7. Step-by-Step Upload & Processing Flow

1. **Upload Request:** The client app sends an HTTP `POST` request containing photo binary data and metadata to the API endpoint.
2. **Traffic Distribution:** The Load Balancer intercepts the upload request and forwards it to an available stateless App Server instance.
3. **Persist Raw Image:** The App Server streams the 2 MB raw photo directly to Object Storage and receives a unique object reference URL.
4. **Write Metadata:** The App Server writes the post details (user ID, timestamp, raw image URL) into the Primary Database.
5. **Enqueue Thumbnail Job:** The App Server emits a `create_thumbnail` job into the Message Queue and immediately returns an HTTP `201 Created` status code to the user.
6. **Async Thumbnail Processing:** A background Worker Engine picks up the job from the queue, downloads the original image, scales it down to a 50 KB thumbnail, uploads the thumbnail to Object Storage, and writes the `thumbnail_url` back to the database.
7. **Feed Cache Invalidation:** The Worker Engine or App Server invalidates or updates the affected follower feed caches in Redis so followers see the updated post upon their next feed refresh.

---

## 8. Architectural Trade-offs

1. **Asynchronous Background Processing vs. Instant Thumbnail Availability:**
   * *Trade-off:* Offloading thumbnail generation to a background message queue keeps HTTP upload response times fast and non-blocking for the uploader. However, during high-traffic spikes, queue delays may mean followers briefly view a post before its thumbnail finish rendering (eventual consistency).
2. **Pre-computed Feed Caching vs. Fan-out Write Amplification:**
   * *Trade-off:* Pre-computing user feeds in Redis on post creation allows instantaneous $O(1)$ read performance for timeline requests. However, when high-profile accounts ("celebrities") post a photo, it triggers a write spike across thousands of follower feed caches simultaneously.

---

## 9. Git Commit & Deployment Steps

Execute the following commands in your local workspace terminal to commit and push the completed Day 7 assignment:

```bash
# Navigate to repository root directory
cd web-foundations-days

# Create directory if it does not exist
mkdir -p day7

# Stage the markdown assignment file
git add day7/photo-app-scaling.md

# Commit with the required message
git commit -m "Day 7 assignment"

# Push to the main remote branch
git push origin main


<FollowUp label="Want to inspect how to handle celebrity fan-out writes in Redis?" query="How can we optimize celebrity fan-out writes in a read-heavy photo application?"/>