# SnapShare: System Architecture & Scaling Plan

This document outlines the high-level architecture and back-of-the-envelope estimations for **SnapShare**, a scalable photo-sharing application where users upload photos and scroll a feed of photos from accounts they follow.

---

## 1. Assumptions

* **Registered Users:** 10,000,000 users.
* **Daily Active Users (DAU):** 10% of registered users = 1,000,000 DAU.
* **Upload Activity:** 1 photo uploaded per active user per day.
* **Feed Scrolling Activity:** 50 feed pages viewed per active user per day.
* **Photo Storage Sizes:**
  * Original photo: 2 MB ($2 \times 10^6$ bytes).
  * Thumbnail image: 50 KB ($50 \times 10^3$ bytes = 0.05 MB).
  * Total storage per uploaded photo: 2.05 MB.
* **Time Estimations:** 1 day $\approx$ 100,000 seconds (exact: 86,400 seconds; scaled to 100,000 seconds for standard back-of-the-envelope system design estimates).

---

## 2. Capacity Estimations

### A. Uploads Per Second (Writes)
$$\text{Uploads per day} = 1,000,000 \text{ photos/day}$$
$$\text{Uploads per second} = \frac{1,000,000 \text{ uploads}}{100,000 \text{ seconds}} = \mathbf{10 \text{ uploads/second}}$$

### B. Feed Views Per Second (Reads)
$$\text{Feed views per day} = 1,000,000 \text{ DAU} \times 50 \text{ views/day} = 50,000,000 \text{ views/day}$$
$$\text{Feed views per second} = \frac{50,000,000 \text{ views}}{100,000 \text{ seconds}} = \mathbf{500 \text{ views/second}}$$

### C. Storage Required Per Year
$$\text{Daily uploads} = 1,000,000 \text{ photos}$$
$$\text{Daily photo storage} = 1,000,000 \times 2.05 \text{ MB} = 2,050,000 \text{ MB} = \mathbf{2.05 \text{ TB/day}}$$
$$\text{Yearly photo storage} = 2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 3. System Workload Profile

SnapShare is **read-heavy**. 

With 500 feed views per second compared to 10 photo uploads per second, the system maintains a **50:1 Read-to-Write ratio**. The architecture prioritizes aggressive caching at the CDN and database levels to minimize primary database reads.

---

## 4. Architecture Diagram      

+--------------------+
                         |     Client User    |
                         +---------+----------+
                                   |
               +-------------------+-------------------+
               | (Static Assets / Photos)              | (API Dynamic Traffic)
               v                                       v
     +-------------------+                   +-------------------+
     | Content Delivery  |                   |   Load Balancer   |
     |   Network (CDN)   |                   +---------+---------+
     +---------+---------+                             |
               |                                       v
               |                            +--------------------+
               |                            |    App Servers     |
               |                            |    (Stateless)     |
               |                            +----+-----+-----+---+
               |                                 |     |     |
               |       +-------------------------+     |     +-------------------------+
               |       |                               |                               |
               v       v                               v                               v
     +-------------------+                   +-------------------+                   +-------------------+
     |   Object Storage  |                   |    Cache Layer    |                   |   Async Message   |
     |     (e.g., S3)    |                   |   (Redis/Memcached|                   |   Queue (Rabbit)  |
     +---------+---------+                   +-------------------+                   +---------+---------+
               ^                                                                               |
               |                                                                               v
               |                                                                     +-------------------+
               |                                                                     |   Worker Server   |
               +---------------------------------------------------------------------+ (Thumbnail Engine) |
                                                                                     +-------------------+

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

## 5. Component Responsibilities

* **CDN (Content Delivery Network):** Caches and serves high-bandwidth photo files and static thumbnails from edge locations geographically close to users to reduce latency and origin server traffic.
* **Load Balancer:** Distributes incoming HTTP dynamic traffic evenly across a pool of stateless application servers to prevent any single server from becoming a bottleneck.
* **Stateless App Servers:** Handles business logic, authentication, feed assembly, and metadata queries without holding session state locally in memory.
* **Cache (e.g., Redis):** Stores frequently accessed user feeds and database query results in RAM to reduce primary database read load.
* **Primary Database (Writes):** Receives write operations (user profile updates, new photo metadata, comments, and follow edges) to maintain transactional consistency.
* **Read Replica Database:** Asynchronously mirrors the primary database to handle read-only queries (e.g., loading follower profiles, searching users) and offload read traffic from the primary DB.
* **Object Storage (e.g., AWS S3 / MinIO):** Provides scalable, durable, and cost-effective cloud storage optimized specifically for large binary unstructured files like original photo uploads.
* **Message Queue (e.g., RabbitMQ / Kafka):** Holds asynchronous thumbnail generation tasks temporarily so photo uploads complete immediately for the client without blocking HTTP response cycles.
* **Background Worker:** Consumes thumbnail generation jobs from the message queue, resizes the original photo down to 50 KB, and saves the generated thumbnail back into Object Storage.

---

## 6. Step-by-Step Upload Flow

1. **Client Upload Request:** The client app sends an HTTP `POST` request containing the 2 MB photo payload and metadata (caption, tags, user ID) to the Load Balancer.
2. **Traffic Distribution:** The Load Balancer routes the incoming request to an available stateless App Server.
3. **Save Raw Binary File:** The App Server streams and uploads the raw 2 MB photo file directly to **Object Storage** and receives back a unique image URL.
4. **Metadata Transaction:** The App Server writes the photo record (user ID, image URL, timestamps) into the **Primary Database**.
5. **Enqueue Thumbnail Job:** The App Server publishes an asynchronous event containing `photo_id` and `object_storage_url` to the **Message Queue**, then immediately returns a `201 Created` HTTP response back to the user.
6. **Asynchronous Processing:** A **Background Worker** picks up the task from the Message Queue, fetches the 2 MB photo from Object Storage, generates the 50 KB thumbnail version, uploads the thumbnail back to Object Storage, and updates the database record with the new `thumbnail_url`.
7. **Cache Update/Invalidation:** The worker or app server invalidates or updates the user's follower feed caches in **Redis** so followers see the new photo thumbnail on their next feed refresh.

---

## 7. System Trade-offs

1. **Asynchronous Processing vs. Real-Time Thumbnail Availability:**
   * **Trade-off:** Offloading thumbnail creation to a message queue makes photo uploads near-instantaneous for the uploader. However, if queue backlog spikes, followers might experience an eventual consistency delay where the post appears in their feed a few seconds before the thumbnail finishes rendering.
2. **Storage Cost & Write Redundancy vs. Read Performance (Pre-computed Feeds vs. Fan-out Reads):**
   * **Trade-off:** Pre-generating and caching user feeds in Redis on every photo upload significantly improves feed read performance ($O(1)$ lookup for 500 views/sec). However, it consumes significantly more RAM and increases write amplification when high-follower accounts post photos.