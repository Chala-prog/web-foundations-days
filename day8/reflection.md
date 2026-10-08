### File 2: `day8/reflection.md`

```markdown
# Course Reflection

The most challenging concept in this course was designing system architectures that handle high-concurrency write surges while maintaining strict data consistency. Understanding how to manage race conditions during high-demand events—such as flash sales or ticket drops—required shifting my mindset from simple single-user database operations to distributed, multi-tiered systems. I overcame this by studying atomic database operations, isolation levels, and lockless patterns like optimistic locking using version numbers.

Based on feedback received on previous design iterations, I would improve the capstone by introducing a hybrid fan-out model for notification and cache update services. Initially, invalidating cache states directly inside the main application worker created unnecessary coupling. Using an event-driven architecture with message queues decouples write confirmations from secondary tasks, allowing the system to scale even faster during peak traffic.

Moving forward, I plan to dive deeper into distributed systems, specifically exploring database sharding strategies, consensus algorithms (such as Raft), and building hands-on projects with Redis streams and Apache Kafka for event-driven message handling.

    