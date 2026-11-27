/* Course Compass 反推引擎（vanilla JS 内联移植，确定性计算，LLM 不得改动数字/门槛/evidenceId） */
(function () {
  const D = window.CC_DATA;
  const EXTRA_SKILLS = [
    ['embedded_c', '嵌入式 C/C++', ['c/c++', 'c语言', '嵌入式c']],
    ['mcu', '单片机与 MCU', ['单片机', 'mcu', 'stm32', 'arm cortex', 'stm32f407']],
    ['rtos', '实时操作系统', ['rtos', 'freertos', 'rt-thread']],
    ['industrial_bus', '工业通信', ['can总线', 'can 总线', 'can bus', 'can/uart', 'can/vesc', 'uart', 'modbus', 'ethercat', '串口通信']],
    ['analog_digital', '模拟与数字电路', ['模拟电路', '数字电路', '模电', '数电', '电子技术']],
    ['pcb', 'PCB 设计', ['pcb', 'altium', '立创eda', 'kicad']],
    ['plc', 'PLC 控制', ['plc', 'tia portal', '梯形图']],
    ['control_system', '运动与自动控制', ['自动控制', '运动控制', '机器人控制', '电机控制', 'simulink', 'matlab', '卡尔曼滤波', 'kalman', '双闭环', 'pid', '前馈控制', '力控', '控制工程', '控制策略', '运动学建模', '硬件在环', 'hil']],
    ['golang', 'Go 语言 / 微服务', ['golang', 'go语言', 'go 开发', 'go开发', 'gin框架', 'grpc']],
    ['cpp_modern', '现代 C++ / 高性能开发', ['modern c++', 'c++11', 'c++17', 'c++20', 'c++开发', '高性能开发', 'stl', 'c++']],
    ['redis', 'Redis 与高并发缓存', ['redis', '缓存击穿', '缓存穿透', '分布式锁', 'memcached']],
    ['mq_kafka', '消息队列与异步架构', ['kafka', 'rabbitmq', 'rocketmq', '消息队列', 'pulsar']],
    ['cloud_k8s', '云原生与 Kubernetes', ['k8s', 'kubernetes', '云原生', 'helm', 'ci/cd', 'cicd', 'github actions']],
    ['computer_vision', '计算机视觉与 OpenCV', ['计算机视觉', 'opencv', 'yolo', 'yolov5', 'yolov8', '目标检测', '图像识别', 'cv算法', '三维重建', 'slam视觉', '视觉slam', '光流', 'optical flow', 'raft', '单目深度', '双目视觉', '3d视觉', '立体视觉', '视觉感知', '视觉伺服', '缺陷检测', '机器视觉', 'resnet', '多目标跟踪', '感知算法', '点云']],
    ['ros_slam', 'ROS2 与机器人导航', ['ros2', 'ros 2', 'ros', 'slam', '路径规划', '导航算法', 'gazebo', 'moveit', 'rosbag', 'rviz', 'rviz2', 'costmap', 'nav2', '自主导航', '多传感器融合', '传感器融合', '具身智能', '具身导航', '视觉语言导航', 'vln', 'vla', 'sim2real', 'amr']],
    ['fpga_verilog', 'FPGA 与数字 IC (Verilog)', ['fpga', 'verilog', 'systemverilog', '数字ic', 'ic验证', 'vivado', 'rtl']],
    ['ai_agent_workflow', 'AI Agent 与工作流编排', ['dify', 'coze', 'langgraph', 'mcp协议', '工作流编排', '智能体编排', 'ai工作流', 'function calling', 'ai agent', 'agent harness', 'agent评测', '智能体']],
    ['sql_bi', 'BI 看板与数据可视化', ['tableau', 'powerbi', 'power bi', 'superset', 'bi看板', '飞书多维表格']],
    ['growth_ops', '增长投放与漏斗实验', ['增长运营', '用户增长', 'a/b测试', 'ab测试', 'roi分析', '小红书种草', '信息流投放', '千川']],
  ];
  const EXTRA_ALIASES_PATCH = {
    'netty': { skillId: 'spring_boot', subTag: 'Netty' },
    '微服务': { skillId: 'spring_boot', subTag: '微服务' },
    'next.js': { skillId: 'web_frontend', subTag: 'Next.js' },
    'nextjs': { skillId: 'web_frontend', subTag: 'Next.js' },
    'tailwind': { skillId: 'web_frontend', subTag: 'TailwindCSS' },
    'vite': { skillId: 'web_frontend', subTag: 'Vite' },
    'playwright': { skillId: 'software_testing', subTag: 'Playwright' },
    '自动化测试': { skillId: 'software_testing', subTag: '自动化测试' },
    '接口测试': { skillId: 'software_testing', subTag: '接口测试' },
    '测试开发': { skillId: 'software_testing', subTag: '测试开发' },
    '测试用例': { skillId: 'software_testing', subTag: '测试用例' },
    '集成测试': { skillId: 'software_testing', subTag: '集成测试' },
    '性能测试': { skillId: 'software_testing', subTag: '性能测试' },
    '压力测试': { skillId: 'software_testing', subTag: '压力测试' },
    '大模型应用': { skillId: 'llm_app_dev' },
    'langchain': { skillId: 'llm_app_dev', subTag: 'LangChain' },
    'rag': { skillId: 'llm_app_dev', subTag: 'RAG' },
    '多模态': { skillId: 'deep_learning', subTag: '多模态' },
    '跨模态': { skillId: 'deep_learning', subTag: '跨模态' },
    'transformer': { skillId: 'deep_learning', subTag: 'Transformer' },
    'fine-tuning': { skillId: 'deep_learning', subTag: 'Fine-tuning' },
    '微调': { skillId: 'deep_learning', subTag: '微调' },
    '零样本': { skillId: 'deep_learning', subTag: 'Zero-shot' },
    'zero-shot': { skillId: 'deep_learning', subTag: 'Zero-shot' },
    '保形预测': { skillId: 'ml_basics', subTag: 'Conformal Prediction' },
    'conformal prediction': { skillId: 'ml_basics', subTag: 'Conformal Prediction' },
    'docker': { skillId: 'linux_deploy', subTag: 'Docker' },
    'ubuntu': { skillId: 'linux_deploy', subTag: 'Ubuntu' },
  };
  const SKILL_BY_ID = new Map([...D.skills, ...EXTRA_SKILLS.map(([id, name]) => ({ id, name, category: '行业硬核技能' }))].map(s => [s.id, s]));
  const COURSE_BY_ID = new Map(D.courses.map((c) => [c.id, c]));
  const JOB_BY_ID = new Map(D.jobs.map((j) => [j.id, j]));
  const ALIASES = {
    ...Object.fromEntries(EXTRA_SKILLS.flatMap(([skillId, , aliases]) => aliases.map(alias => [alias, { skillId }]))),
    ...D.aliases,
    ...EXTRA_ALIASES_PATCH,
  };
  // Bare 2-char "测试" causes massive false positives on lab/benchmark/HIL/test-time research text.
  delete ALIASES['测试'];
  const ALIAS_KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  const PLACEHOLDER = '[待补充实测数据]';
  const EMPLOYMENT_SCHEMA_VERSION = '1.3';
  const MATCH_VERSION = 'match-2.0.0';
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round2 = (n) => Math.round(n * 100) / 100;
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isAscii = (a) => /^[\x20-\x7e]+$/.test(a);
  const coursesOfMajor = (m) => D.courses.filter((c) => c.major === m);
  const rankPercent = (p) => (p.rank ? (p.rank.position / p.rank.total) * 100 : null);
  const skillName = (id) => (SKILL_BY_ID.get(id) ? SKILL_BY_ID.get(id).name : id);
  const courseName = (id) => (COURSE_BY_ID.get(id) ? COURSE_BY_ID.get(id).name : id);

  /* ---- 技能归一化：Java≠JavaScript，长别名优先，整词边界/中文子串 ---- */
  function normalizeSkill(raw) {
    const k = String(raw).trim().toLowerCase();
    const e = ALIASES[k];
    return e ? { skillId: e.skillId, subTag: e.subTag, matchedAlias: k } : null;
  }
  function extractSkillsFromText(text) {
    const lower = String(text).toLowerCase();
    const found = [];
    const consumed = new Array(lower.length).fill(false);
    for (const alias of ALIAS_KEYS) {
      const entry = ALIASES[alias];
      if (isAscii(alias)) {
        const re = new RegExp('(?<![a-z0-9])' + escapeRegExp(alias) + '(?![a-z0-9])', 'g');
        let m;
        while ((m = re.exec(lower)) !== null) {
          const start = m.index;
          if (consumed.slice(start, start + alias.length).some(Boolean)) continue;
          for (let i = start; i < start + alias.length; i++) consumed[i] = true;
          found.push({ skillId: entry.skillId, subTag: entry.subTag, matchedAlias: alias });
        }
      } else {
        let idx = lower.indexOf(alias);
        while (idx !== -1) {
          if (!consumed.slice(idx, idx + alias.length).some(Boolean)) {
            for (let i = idx; i < idx + alias.length; i++) consumed[i] = true;
            found.push({ skillId: entry.skillId, subTag: entry.subTag, matchedAlias: alias });
          }
          idx = lower.indexOf(alias, idx + alias.length);
        }
      }
    }
    const seen = new Set();
    return found.filter((f) => {
      const key = f.skillId + '|' + (f.subTag || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function countOccurrences(lowerText, alias) {
    const re = isAscii(alias)
      ? new RegExp('(?<![a-z0-9])' + escapeRegExp(alias) + '(?![a-z0-9])', 'g')
      : new RegExp(escapeRegExp(alias), 'g');
    return (lowerText.match(re) || []).length;
  }

  /* ---- 三态 + 经历分级权重（实习/自研项目/竞赛/科研为主；课设仅作零经历兜底低权重） ---- */
  const VERIFICATION_FACTOR = { unverified: 0.45, user_confirmed: 0.92, system_verified: 0.96, reviewer_verified: 1, rejected: 0 };
  const EVIDENCE_TYPE_WEIGHT = { internship: 1.0, project: 0.94, competition: 0.90, research: 0.88, other: 0.72, coursework: 0.38 };
  const CANONICAL_TYPE_LABEL = { internship: '实习', project: '项目', competition: '竞赛', research: '科研', coursework: '课设', other: '成果' };
  function classifyEvidenceText(typeStr, fallbackText = '') {
    const t = String(typeStr || '').trim();
    if (/实习|intern/i.test(t)) return 'internship';
    if (/竞赛|大赛|比赛|获奖/i.test(t)) return 'competition';
    if (/科研|论文|发表|专利|课题/i.test(t)) return 'research';
    if (/课设|课程作业|课程设计|作业|实验报告/i.test(t)) return 'coursework';
    if (/项目|开源|自研|独立开发|project/i.test(t)) return 'project';
    if (!t || t === '成果' || t === '其他') {
      const f = String(fallbackText || '');
      if (/实习|intern/i.test(f)) return 'internship';
      if (/竞赛|大赛|电赛|蓝桥杯|数模|robomaster|robocon|挑战杯|互联网\+|icpc|acm/i.test(f)) return 'competition';
      if (/论文|科研|课题组|综述|专利/i.test(f)) return 'research';
      if (/课程作业|课设|课程设计|期末作业|实验报告/i.test(f)) return 'coursework';
    }
    return 'other';
  }
  function canonicalEvidenceType(ev) {
    const t = String(ev?.type || '').trim();
    if (['实习', '项目', '竞赛', '科研', '课设'].includes(t)) return t;
    return CANONICAL_TYPE_LABEL[classifyEvidenceText(t, (ev?.title || '') + ' ' + (ev?.description || ''))];
  }
  function evidenceKindOf(ev) {
    return classifyEvidenceText(ev?.type || '', (ev?.title || '') + ' ' + (ev?.description || ''));
  }
  function hasHardcoreExperience(p) {
    return (p?.evidences || []).some(ev => verificationOf(ev) !== 'rejected' && ['internship', 'project', 'competition', 'research'].includes(evidenceKindOf(ev)));
  }
  const verificationOf = (e) => Object.hasOwn(VERIFICATION_FACTOR, e.verificationStatus)
    ? e.verificationStatus : e.verified ? 'user_confirmed' : 'unverified';
  const hasVerifiedEvidence = (e) => VERIFICATION_FACTOR[verificationOf(e)] >= VERIFICATION_FACTOR.user_confirmed;
  function skillStatusMap(p) {
    const m = new Map();
    for (const cid of p.completedCourseIds) {
      for (const sid of (COURSE_BY_ID.get(cid)?.teaches || [])) m.set(sid, 'learned_unverified');
    }
    for (const sid of p.completedCourseSkillIds || []) m.set(sid, 'learned_unverified');
    for (const ev of p.evidences) {
      const status = verificationOf(ev);
      if (status === 'rejected') continue;
      const kind = evidenceKindOf(ev);
      for (const sid of ev.skillIds) {
        if (hasVerifiedEvidence(ev) && kind !== 'coursework') m.set(sid, 'evidenced');
        else if (!m.has(sid)) m.set(sid, 'learned_unverified');
      }
    }
    return m;
  }
  const SELF_STUDY_CATALOG = {
    java: {
      bilibili: [
        { title: '黑马程序员 Java 零基础到并发与 JVM 实战', author: '黑马程序员', hours: '35h', focus: '集合源码 / 多线程锁 / JVM 调优', url: 'https://search.bilibili.com/all?keyword=黑马程序员+Java+并发+JVM' },
        { title: '尚硅谷 JUC 并发编程与高并发实战', author: '尚硅谷', hours: '12h', focus: 'CompletableFuture / ThreadPool / AQS 底层', url: 'https://search.bilibili.com/all?keyword=尚硅谷+JUC+并发编程' },
      ],
      officialDoc: { label: 'Dev.java 官方文档', url: 'https://dev.java/learn/' },
      selfProject: {
        title: '自研高并发抢券/秒杀服务（非课设 CRUD）',
        whyHiringLikes: '能讲清线程池参数调优、乐观锁防超卖与 JUnit 并发压测对比，面试直接甩开图书管理系统',
        deliverables: ['GitHub 工程仓库 + README 架构图', 'JUnit 并发竞争测试全绿截图', 'JMeter 压测 QPS 与耗时对比表'],
      },
      contests: ['蓝桥杯 Java 软件开发', '中国软件杯'],
    },
    spring_boot: {
      bilibili: [
        { title: '尚硅谷 SpringBoot3 + 微服务实战精讲', author: '尚硅谷', hours: '24h', focus: 'REST 契约 / MyBatis-Plus / 统一异常处理', url: 'https://search.bilibili.com/all?keyword=尚硅谷+SpringBoot3' },
        { title: '黑马点评 Redis + Spring Boot 实战项目课', author: '黑马程序员', hours: '28h', focus: '分布式锁 / 秒杀异步下单 / 缓存一致性', url: 'https://search.bilibili.com/all?keyword=黑马点评+SpringBoot+Redis' },
      ],
      officialDoc: { label: 'Spring Boot 官方指南', url: 'https://spring.io/guides' },
      selfProject: {
        title: '高并发校园拼单/抢券微服务 + Redis 分布式锁实战',
        whyHiringLikes: '覆盖校招高频 80% 考点：事务边界、幂等校验、Redis 缓存防穿透与 MockMvc 集成测试',
        deliverables: ['Docker Compose 一键拉起源码', 'Swagger/OpenAPI 接口文档', 'JMeter 1000 并发对比实测日志'],
      },
      contests: ['中国软件杯', '阿里云天池编程赛'],
    },
    golang: {
      bilibili: [
        { title: 'Go 语言 Gin + GORM 微服务全栈实战', author: '七米 / 尚硅谷', hours: '22h', focus: 'Goroutine 调度 / Channel / Gin 中间件', url: 'https://search.bilibili.com/all?keyword=Go语言+Gin+GORM+微服务' },
        { title: 'MIT 6.824 / 6.5840 分布式系统精讲（中文字幕）', author: 'MIT OpenCourseWare', hours: '30h', focus: 'Raft 共识 / MapReduce / 分布式 KV', url: 'https://search.bilibili.com/all?keyword=MIT+6.824+分布式系统' },
      ],
      officialDoc: { label: 'Go 官方 Tour & Effective Go', url: 'https://go.dev/doc/effective_go' },
      selfProject: {
        title: '基于 Raft 或一致性哈希的轻量级分布式 KV 存储 / 短链高并发网关',
        whyHiringLikes: '体现对 Goroutine 并发模型、pprof 性能火焰图与网络 I/O 的真实工程掌控',
        deliverables: ['GitHub 仓库 + Go Benchmark 基准数据', 'pprof CPU/内存火焰图截图', '节点宕机容错演示'],
      },
      contests: ['全国大学生计算机系统能力大赛', 'CCF CSP'],
    },
    cpp_modern: {
      bilibili: [
        { title: '侯捷 C++ 面向对象与 STL 源码剖析 + 现代 C++11/17', author: '侯捷 / 恋恋风辰', hours: '26h', focus: '右值引用 / 智能指针 / Epoll Reactor', url: 'https://search.bilibili.com/all?keyword=现代C+++Reactor+网络编程' },
        { title: 'C++ 高性能 Web 服务器（Muduo / Epoll 线程池）手搓实战', author: 'B站硬核自研向', hours: '16h', focus: '零拷贝 / 定时器轮 / 内存泄漏 Valgrind 排查', url: 'https://search.bilibili.com/all?keyword=C+++WebServer+Epoll+实战' },
      ],
      officialDoc: { label: 'cppreference 标准参考', url: 'https://en.cppreference.com/w/' },
      selfProject: {
        title: 'Linux Epoll Reactor 多线程高并发网络库 / 异步日志系统',
        whyHiringLikes: 'C++ 校招核心试金石，直接支撑操作系统、网络 IO 多路复用与内存管理追问',
        deliverables: ['CMake 工程 + Webbench 压测报告', 'ASan/Valgrind 零内存泄漏证明', '状态机解析时序图'],
      },
      contests: ['ACM-ICPC / CCPC', '计算机系统能力大赛'],
    },
    redis: {
      bilibili: [
        { title: '黑马程序员 Redis 原理与集群高并发专题', author: '黑马程序员', hours: '18h', focus: '跳表与底层结构 / 哨兵集群 / 缓存雪崩击穿', url: 'https://search.bilibili.com/all?keyword=黑马+Redis+原理+高并发' },
      ],
      officialDoc: { label: 'Redis 官方文档', url: 'https://redis.io/docs/latest/' },
      selfProject: {
        title: '多级缓存架构压测台（本地 Caffeine + Redis Lua 限流器）',
        whyHiringLikes: '量化展示加缓存前后 P99 延迟与数据库 CPU 降幅，面试官最爱问实测数据',
        deliverables: ['Lua 原子脚本源码', '击穿/雪崩故障注入测试对比表'],
      },
      contests: ['中国软件杯'],
    },
    mq_kafka: {
      bilibili: [
        { title: '尚硅谷 Kafka / RocketMQ 原理与削峰填谷实战', author: '尚硅谷', hours: '14h', focus: '顺序消息 / 死信队列 / 消费幂等与防丢失', url: 'https://search.bilibili.com/all?keyword=尚硅谷+Kafka+RocketMQ' },
      ],
      officialDoc: { label: 'Apache Kafka 文档', url: 'https://kafka.apache.org/documentation/' },
      selfProject: {
        title: '异步削峰订单消息管线（死信重试 + 幂等消费验证）',
        whyHiringLikes: '证明你懂分布式最终一致性与消息堆积排障，不只是调用 send() API',
        deliverables: ['Docker Compose Kafka 演练仓库', '消费者宕机与重复投递幂等验证日志'],
      },
      contests: ['阿里云天池中间件大赛'],
    },
    sql_rdbms: {
      bilibili: [
        { title: '尚硅谷 MySQL 高级篇（索引 B+树 / 事务 MVCC / EXPLAIN 优化）', author: '尚硅谷宋红康', hours: '20h', focus: '联合索引最左匹配 / 锁机制 / 慢查询定位', url: 'https://search.bilibili.com/all?keyword=尚硅谷+MySQL高级篇+MVCC+索引' },
      ],
      officialDoc: { label: 'PostgreSQL 官方文档', url: 'https://www.postgresql.org/docs/' },
      selfProject: {
        title: '百万级数据表结构设计与 EXPLAIN 慢查询 10 倍优化实验',
        whyHiringLikes: '用真实 100 万行模拟订单数据实测建索引前后扫描行数与耗时对比',
        deliverables: ['建表与造数脚本', 'EXPLAIN 优化前后执行计划与耗时对比报告'],
      },
      contests: ['全国大学生计算机系统能力大赛数据库赛道'],
    },
    linux_deploy: {
      bilibili: [
        { title: '尚硅谷 Docker 与 Linux 运维实战精讲', author: '尚硅谷周阳', hours: '14h', focus: '容器网络 / 多阶段构建 / Nginx 反向代理', url: 'https://search.bilibili.com/all?keyword=尚硅谷+Docker+实战' },
      ],
      officialDoc: { label: 'Docker 官方文档', url: 'https://docs.docker.com/get-started/' },
      selfProject: {
        title: '个人项目全链路容器化 + Nginx 网关 + Prometheus/健康探针监控',
        whyHiringLikes: '让你的所有开源项目拥有公网/一键可拉起体验，而非老师机上的本地截图',
        deliverables: ['最小化 Dockerfile + Compose', '一次故障注入排查实录'],
      },
      contests: ['华为 ICT 大赛云赛道'],
    },
    cloud_k8s: {
      bilibili: [
        { title: '尚硅谷 Kubernetes (K8s) 云原生从入门到生产实践', author: '尚硅谷雷丰阳', hours: '22h', focus: 'Pod 调度 / Service / Ingress / CI/CD 流水线', url: 'https://search.bilibili.com/all?keyword=尚硅谷+K8s+云原生' },
      ],
      officialDoc: { label: 'Kubernetes 官方文档', url: 'https://kubernetes.io/docs/home/' },
      selfProject: {
        title: '基于 Kind/k3s + GitHub Actions 的服务自动构建与滚动发布流水线',
        whyHiringLikes: '基础设施与后端通用加分硬核工程证明',
        deliverables: ['K8s Manifest + CI YAML', '零停机滚动升级验证录屏/日志'],
      },
      contests: ['华为 ICT 大赛'],
    },
    web_frontend: {
      bilibili: [
        { title: 'React 18 + TypeScript + Next.js 全栈实战精讲', author: 'Coderwhy / 技术蛋老师', hours: '24h', focus: 'Hooks 原理 / 状态管理 / 性能优化 / SSR', url: 'https://search.bilibili.com/all?keyword=React18+TypeScript+实战' },
        { title: '浏览器渲染原理与前端性能调优专题', author: '渡一 / 程序员鱼皮', hours: '10h', focus: '事件循环 / 虚拟列表 / Core Web Vitals', url: 'https://search.bilibili.com/all?keyword=前端+浏览器渲染原理+性能优化' },
      ],
      officialDoc: { label: 'React 官方中文文档', url: 'https://zh-hans.react.dev/learn' },
      selfProject: {
        title: '万行数据虚拟滚动协同看板 + Playwright E2E 自动化验证',
        whyHiringLikes: '用真实渲染帧率、首屏 LCP 与端到端断言证明前端工程深度',
        deliverables: ['线上可访问站点链接', 'Performance 帧率优化前后对比', 'Playwright 测试用例'],
      },
      contests: ['字节跳动前端青训营', '中国软件杯'],
    },
    python: {
      bilibili: [
        { title: '小甲鱼 / 黑马 Python 数据结构与异步工程实战', author: '黑马 / 莫烦', hours: '18h', focus: 'Asyncio 并发 / FastAPI / Pytest 自动化测试', url: 'https://search.bilibili.com/all?keyword=Python+FastAPI+异步+实战' },
      ],
      officialDoc: { label: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/index.html' },
      selfProject: {
        title: 'FastAPI 异步数据抓取清洗管线 + Pytest 边界回归套件',
        whyHiringLikes: '告别单文件脚本，展现类型标注、异常处理与可复现测试能力',
        deliverables: ['GitHub 仓库 + pyproject.toml', 'Pytest 覆盖率报告'],
      },
      contests: ['蓝桥杯 Python', '全国大学生数学建模'],
    },
    llm_app_dev: {
      bilibili: [
        { title: '动手学大模型应用开发（RAG / Agent / Eval 全链路）', author: 'Datawhale / 吴恩达', hours: '16h', focus: '混合检索 / Rerank / Function Calling / 评测集', url: 'https://search.bilibili.com/all?keyword=Datawhale+大模型应用开发+RAG+Agent' },
        { title: '李宏毅 Generative AI / 大语言模型原理精讲', author: '台大李宏毅', hours: '20h', focus: 'Transformer / RLHF / Agentic Workflow', url: 'https://search.bilibili.com/all?keyword=李宏毅+生成式AI+大模型' },
      ],
      officialDoc: { label: 'LangGraph & OpenAI Function Calling 指南', url: 'https://langchain-ai.github.io/langgraph/' },
      selfProject: {
        title: '垂直领域混合检索 RAG + 工具调用 Agent（带 30 条人工评测集与 Badcase 归因）',
        whyHiringLikes: 'AI 应用校招最看重：不要只套壳 Chat UI，要拿得出 Recall@5、幻觉率与延迟对比表',
        deliverables: ['本地可跑 GitHub Repo', 'Baseline vs Rerank 评测对照表', 'Badcase 分析报告'],
      },
      contests: ['Datawhale AI 夏令营', '阿里云天池大模型赛', 'Qoder 高校创造力大赛'],
    },
    ai_agent_workflow: {
      bilibili: [
        { title: 'MCP 协议 + LangGraph / Dify 多智能体工作流实战', author: 'B站 AI Agent 专题', hours: '12h', focus: 'Tool Use / Human-in-the-loop / 状态持久化', url: 'https://search.bilibili.com/all?keyword=LangGraph+MCP+Agent+实战' },
      ],
      officialDoc: { label: 'Model Context Protocol 官方规范', url: 'https://modelcontextprotocol.io/' },
      selfProject: {
        title: '多工具协同垂直工作流 Agent（带结构化 Schema 校验与失败降级）',
        whyHiringLikes: '展示你在 Agent 稳定性、防注入与确定性校验上的工程思考',
        deliverables: ['Agent 仓库 + 在线演示录屏', '工具调用成功率评测脚本'],
      },
      contests: ['Qoder 高校创造力大赛', '讯飞 AI 开发者大赛'],
    },
    deep_learning: {
      bilibili: [
        { title: '跟李沐学 AI：动手学深度学习 PyTorch 版', author: '李沐 (Mu Li)', hours: '40h', focus: 'ResNet / Attention / Transformer 手写复现', url: 'https://search.bilibili.com/all?keyword=李沐+动手学深度学习+PyTorch' },
      ],
      officialDoc: { label: 'PyTorch 官方教程', url: 'https://pytorch.org/tutorials/' },
      selfProject: {
        title: '开源数据集端到端训练 + 消融实验 + 典型错例分析仓库',
        whyHiringLikes: '算法岗面试官最认你的超参消融表格与 Grad-CAM / 错例洞察，而不是跑通 demo.py',
        deliverables: ['训练/评测脚本 + 固定种子复现说明', '消融对比表格'],
      },
      contests: ['天池/Kaggle 算法竞赛', '挑战杯'],
    },
    computer_vision: {
      bilibili: [
        { title: '计算机视觉 OpenCV + YOLOv8/v11 工业检测部署实战', author: '霹雳吧啦Wz / 同济子豪兄', hours: '22h', focus: '目标检测 / TensorRT/ONNX 推理加速 / 标定', url: 'https://search.bilibili.com/all?keyword=霹雳吧啦Wz+目标检测+YOLO' },
      ],
      officialDoc: { label: 'OpenCV & ONNX Runtime 文档', url: 'https://docs.opencv.org/4.x/' },
      selfProject: {
        title: '工业缺陷或双目深度检测 + ONNX/TensorRT 帧率加速实测',
        whyHiringLikes: '兼具模型精度与端侧推理延迟优化，机器人/智驾/制造企业最抢手',
        deliverables: ['训练+ONNX推理源码', 'PyTorch vs ONNX 耗时与 mAP 对比表'],
      },
      contests: ['RoboMaster 视觉组', '中国机器人及人工智能大赛'],
    },
    ml_basics: {
      bilibili: [
        { title: '吴恩达机器学习 + 菜菜的 sklearn 实战精讲', author: '吴恩达 / 菜菜', hours: '24h', focus: '特征工程 / XGBoost/LightGBM / 防泄漏交叉验证', url: 'https://search.bilibili.com/all?keyword=菜菜的sklearn+机器学习' },
      ],
      officialDoc: { label: 'scikit-learn 官方用户指南', url: 'https://scikit-learn.org/stable/user_guide.html' },
      selfProject: {
        title: '金融风控/用户流失预测竞赛级 Baseline（Pipeline 防泄漏 + SHAP 可解释性）',
        whyHiringLikes: '严格隔离验证集并输出特征贡献度归因',
        deliverables: ['Notebook/脚本 + PR/AUC 对比表', 'SHAP 归因图'],
      },
      contests: ['Kaggle Tabular', '全国大学生统计建模大赛'],
    },
    embedded_c: {
      bilibili: [
        { title: '正点原子 / 江协科技 C语言指针与嵌入式底层精讲', author: '江协科技 / 正点原子', hours: '20h', focus: '指针与内存布局 / 位操作 / volatile 与中断安全', url: 'https://search.bilibili.com/all?keyword=嵌入式C语言+指针+内存+正点原子' },
      ],
      officialDoc: { label: 'Embedded C 编码规范', url: 'https://barrgroup.com/embedded-systems/books/embedded-c-coding-standard' },
      selfProject: {
        title: '零动态内存分配的环形缓冲区 + 协议帧状态机解析库（含 PC 单元测试）',
        whyHiringLikes: '不用等买开发板，直接展示对字节序、断包粘包、CRC 校验与内存安全的扎实功底',
        deliverables: ['纯 C 模块仓库 + Unity/CMock 测试报告', '异常丢包/乱序用例日志'],
      },
      contests: ['全国大学生嵌入式芯片与系统设计竞赛', '蓝桥杯嵌入式'],
    },
    mcu: {
      bilibili: [
        { title: '江协科技 STM32 入门教程（寄存器与标准/HAL库精讲）', author: '江协科技', hours: '28h', focus: 'GPIO/中断/DMA/串口/定时器 PWM', url: 'https://search.bilibili.com/all?keyword=江协科技+STM32' },
        { title: '稚晖君 / 硬核嵌入式 HAL 库 + DMA + 空闲中断实战', author: '正点原子 / 野火', hours: '16h', focus: '串口 DMA 不定长收发 / I2C/SPI 驱动排查', url: 'https://search.bilibili.com/all?keyword=STM32+HAL库+DMA+串口空闲中断' },
      ],
      officialDoc: { label: 'ST STM32 官方文档', url: 'https://www.st.com/en/microcontrollers-microprocessors/stm32-32-bit-arm-cortex-mcus/documentation.html' },
      selfProject: {
        title: '基于 STM32（或 Renode/QEMU 仿真）的多传感器 DMA 采集与闭环调速系统',
        whyHiringLikes: '能现场画出 DMA + 空闲中断 + 逻辑分析仪波形排查链路，完胜点灯流水账',
        deliverables: ['CubeMX/HAL 工程源码', '逻辑分析仪/串口实测截图', '接线与排障手册'],
      },
      contests: ['全国大学生电子设计竞赛', '蓝桥杯嵌入式组', 'RoboMaster'],
    },
    rtos: {
      bilibili: [
        { title: '韦东山 FreeRTOS 源码详解与任务调度实战', author: '韦东山百问网', hours: '20h', focus: '任务切换 / 消息队列 / 信号量优先级翻转', url: 'https://search.bilibili.com/all?keyword=韦东山+FreeRTOS' },
      ],
      officialDoc: { label: 'FreeRTOS 官方文档', url: 'https://www.freertos.org/Documentation/00-Overview' },
      selfProject: {
        title: 'QEMU / Zephyr RTOS 多线程传感器采集与优先级调度延迟实测',
        whyHiringLikes: '不用开发板也能跑 QEMU 仿真实测队列满超时与堆栈水位线',
        deliverables: ['RTOS 源码仓库 + 仿真日志', '任务响应延迟测试记录'],
      },
      contests: ['全国大学生嵌入式芯片与系统设计竞赛'],
    },
    industrial_bus: {
      bilibili: [
        { title: '汽车与机器人 CAN / CAN-FD 总线与 SocketCAN 实战', author: '工控嵌入式专题', hours: '8h', focus: '报文帧结构 / DBC 解析 / 总线仲裁与错误帧', url: 'https://search.bilibili.com/all?keyword=CAN总线+SocketCAN+DBC解析' },
      ],
      officialDoc: { label: 'Linux SocketCAN 文档', url: 'https://www.kernel.org/doc/html/latest/networking/can.html' },
      selfProject: {
        title: 'Linux vcan 虚拟 CAN 总线电机指令收发与 DBC 解析/异常过滤工具',
        whyHiringLikes: '新能源车企/机器人公司（如理想、博世、普渡）面试核心直击点',
        deliverables: ['SocketCAN C/Python 源码', 'candump 过滤验证日志'],
      },
      contests: ['全国大学生智能汽车竞赛', 'RoboMaster'],
    },
    ros_slam: {
      bilibili: [
        { title: '鱼香ROS2 (动手学ROS2) + 古月居 SLAM 导航实战', author: '鱼香ROS / 古月居', hours: '26h', focus: 'Topic/Service/Action / TF2 / Nav2 仿真建图', url: 'https://search.bilibili.com/all?keyword=鱼香ROS2+动手学ROS2+Nav2' },
      ],
      officialDoc: { label: 'ROS 2 官方文档', url: 'https://docs.ros.org/en/humble/' },
      selfProject: {
        title: 'Gazebo 仿真差速小车 SLAM 建图与动态避障 Nav2 调参对比',
        whyHiringLikes: '普渡、智元、大疆、车企智驾规控实习标准入场券',
        deliverables: ['ROS2 Package 源码', 'RViz 建图与避障录屏', '关键参数调优笔记'],
      },
      contests: ['RoboMaster 哨兵/高校AI挑战赛', '全国大学生智能车竞赛'],
    },
    fpga_verilog: {
      bilibili: [
        { title: '正点原子 / 小梅哥 FPGA Verilog 从零到数字 IC 仿真实战', author: '小梅哥 / 正点原子', hours: '28h', focus: '跨时钟域 CDC / 状态机 / AXI 总线 / Testbench', url: 'https://search.bilibili.com/all?keyword=小梅哥+FPGA+Verilog+Testbench' },
      ],
      officialDoc: { label: 'HDLBits 刷题平台', url: 'https://hdlbits.01xz.net/' },
      selfProject: {
        title: '手写异步 FIFO + AXI-Lite 外设控制器与 SystemVerilog 仿真波形验证',
        whyHiringLikes: '芯片验证与 FPGA 研发岗面试必考手撕异步 FIFO 与时序约束',
        deliverables: ['Verilog 源码 + Testbench', 'ModelSim/Verilator 波形与覆盖率截图'],
      },
      contests: ['全国大学生集成电路创新创业大赛（集创赛）'],
    },
    pcb: {
      bilibili: [
        { title: '凡亿教育 / 立创 EDA 四层板高速 PCB 设计与信号完整性实战', author: '凡亿 / 嘉立创', hours: '20h', focus: '原理图规范 / 差分走线 / 电源树与打板调试', url: 'https://search.bilibili.com/all?keyword=立创EDA+四层板+PCB实战' },
      ],
      officialDoc: { label: 'KiCad / 立创 EDA 文档', url: 'https://docs.kicad.org/' },
      selfProject: {
        title: '独立设计一块带电源保护与通信接口的 STM32 最小系统四层控制板（免费打样焊接）',
        whyHiringLikes: '嘉立创每月可免费打样，实物板卡 + 示波器纹波测试图是最硬核的硬件简历',
        deliverables: ['原理图与 PCB 源文件 + BOM', '实物实测纹波/带载照片'],
      },
      contests: ['全国大学生电子设计竞赛'],
    },
    control_system: {
      bilibili: [
        { title: 'DR_CAN 自动控制原理 + 现代控制理论（PID / LQR / 卡尔曼滤波）', author: 'DR_CAN', hours: '18h', focus: '状态空间 / LQR 推导 / Simulink 仿真建模', url: 'https://search.bilibili.com/all?keyword=DR_CAN+自动控制+卡尔曼滤波+LQR' },
      ],
      officialDoc: { label: 'MATLAB & Simulink Onramp', url: 'https://matlabacademy.mathworks.com/' },
      selfProject: {
        title: '倒立摆/电机双闭环 PID vs LQR Simulink 抗扰动仿真对比',
        whyHiringLikes: '把课本公式落成抗阶跃扰动超调量、调节时间量化对比图',
        deliverables: ['Simulink/Python 控制模型源码', '超调量与稳态误差对比曲线'],
      },
      contests: ['全国大学生智能汽车竞赛', 'RoboMaster'],
    },
    plc: {
      bilibili: [
        { title: '西门子 S7-1200/1500 TIA Portal 博途与工业通信实战', author: '工控老王 / 技成培训', hours: '22h', focus: 'SCL 结构化编程 / Profinet / 西门子杯赛题', url: 'https://search.bilibili.com/all?keyword=TIA+Portal+西门子1200+SCL+实战' },
      ],
      officialDoc: { label: '西门子杯赛题中心', url: 'https://www.siemenscup-cimc.org.cn/' },
      selfProject: {
        title: 'TIA Portal + Factory IO 虚拟分拣产线闭环控制与急停联锁仿真',
        whyHiringLikes: '无需实体产线即可演示完整工控逻辑与异常联锁恢复',
        deliverables: ['博途工程 + SCL 代码', 'Factory IO 联调演示录屏'],
      },
      contests: ['西门子杯中国智能制造挑战赛'],
    },
    solidworks: {
      bilibili: [
        { title: 'SolidWorks 零件建模、装配体干涉检查与工程图出图规范', author: 'SolidWorks 实战派', hours: '16h', focus: '自顶向下设计 / 公差配合 / BOM 出图', url: 'https://search.bilibili.com/all?keyword=SolidWorks+装配体+工程图+实战' },
      ],
      officialDoc: { label: 'FreeCAD / SolidWorks 学习中心', url: 'https://my.solidworks.com/' },
      selfProject: {
        title: '带传动校核与公差标注的机器人机械臂末端执行器完整装配包',
        whyHiringLikes: '脱离教科书老式减速器测绘，体现真实机械结构与公差选型思考',
        deliverables: ['三维装配模型 + 规范工程图 PDF', '干涉检查与选型计算书'],
      },
      contests: ['全国大学生机械创新设计大赛', 'ROBOCON'],
    },
    finite_element: {
      bilibili: [
        { title: 'ANSYS Workbench 结构静力学、模态分析与网格收敛性验证', author: '仿真秀 / B站CAE', hours: '15h', focus: '边界条件约束 / 应力奇异排查 / 轻量化拓扑优化', url: 'https://search.bilibili.com/all?keyword=ANSYS+Workbench+结构静力学+网格无关性' },
      ],
      officialDoc: { label: 'ANSYS 学习论坛', url: 'https://courses.ansys.com/' },
      selfProject: {
        title: '新能源电池包支架/机械臂连杆静力学与模态轻量优化对比报告',
        whyHiringLikes: '做网格无关性验证与结构减重对比，直接命中车企 CAE/结构校招面试追问',
        deliverables: ['仿真工程文件', '减重前后最大应力与安全系数对照表'],
      },
      contests: ['全国大学生机械创新设计大赛'],
    },
    battery_materials: {
      bilibili: [
        { title: '锂离子电池电化学原理、阻抗 EIS 与电池测试体系精讲', author: '材料人 / 学术科研派', hours: '14h', focus: '倍率性能 / EIS 拟合 / 产热与失效分析', url: 'https://search.bilibili.com/all?keyword=锂离子电池+电化学+EIS+倍率性能' },
      ],
      officialDoc: { label: 'PyBaMM 开源电池仿真文档', url: 'https://docs.pybamm.org/' },
      selfProject: {
        title: '基于 PyBaMM 的不同倍率/温度下锂电池电压曲线与极化仿真对比分析',
        whyHiringLikes: '用开源电化学仿真工具补足没有高精尖测试设备的遗憾，展现定量研发思维',
        deliverables: ['PyBaMM 复现脚本 + 极化曲线对比报告'],
      },
      contests: ['全国大学生可再生能源科技竞赛', '挑战杯'],
    },
    data_analysis: {
      bilibili: [
        { title: '跟猴子学数据分析（SQL + Python Pandas + 指标体系搭建）', author: '猴子数据分析 / 戴师兄', hours: '22h', focus: '漏斗/留存/RFM / 异常波动归因 / A/B 测试', url: 'https://search.bilibili.com/all?keyword=戴师兄+数据分析+SQL+Python+实战' },
      ],
      officialDoc: { label: 'pandas 官方教程', url: 'https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html' },
      selfProject: {
        title: '基于千万级真实电商公开行为日志的用户留存与复购归因专题报告',
        whyHiringLikes: '阿里/字节/美团商业分析标配实操：自己写 SQL+Python 得出可落地的业务调优测算',
        deliverables: ['GitHub SQL+Python 脚本', '一页纸高管数据结论与预测看板'],
      },
      contests: ['正大杯全国大学生市场调查与分析大赛', '全国大学生统计建模大赛'],
    },
    sql_bi: {
      bilibili: [
        { title: 'Tableau / PowerBI 商业智能看板搭建与业务指标体系实战', author: '戴师兄 / 商业分析派', hours: '12h', focus: 'DAX 度量值 / 多维钻取看板 / 经营周报自动化', url: 'https://search.bilibili.com/all?keyword=PowerBI+Tableau+商业看板+实战' },
      ],
      officialDoc: { label: 'Microsoft Power BI 学习路径', url: 'https://learn.microsoft.com/zh-cn/training/powerplatform/power-bi' },
      selfProject: {
        title: '零售供应链/电商 GMV 异动监控交互式 BI 看板',
        whyHiringLikes: '直观视觉作品集链接，面试商分/运营岗直接投屏展示',
        deliverables: ['看板截图/公开链接', '指标口径字典与异常归因摘要'],
      },
      contests: ['正大杯市调大赛', '全国高校商业精英挑战赛'],
    },
    market_research: {
      bilibili: [
        { title: '大厂产品与用研经理：深度用户访谈、问卷设计、Kano 模型与竞品拆解', author: '三节课 / PMTalk', hours: '10h', focus: '去偏见追问技巧 / 样本抽样 / 需求优先级矩阵', url: 'https://search.bilibili.com/all?keyword=用户研究+用户访谈+Kano模型+产品经理' },
      ],
      officialDoc: { label: '人人都是产品经理 · 用研专题', url: 'https://www.woshipm.com/' },
      selfProject: {
        title: '针对某高频校内/消费 App（如 AI 搜索/校园外卖）的 15 人深度访谈与功能改版 PRD',
        whyHiringLikes: '脱离“随便发 20 份同学问卷”的流水账，拿出真实访谈录音逐字稿、痛点频次与高保真原型',
        deliverables: ['访谈提纲与脱敏逐字稿', '需求优先级矩阵 + Axure/Figma 原型链接'],
      },
      contests: ['正大杯全国大学生市场调查与分析大赛', '中国国际大学生创新大赛'],
    },
    competitive_analysis: {
      bilibili: [
        { title: '产品经理商业级竞品分析框架（体验路径拆解 / 商业化变现对比）', author: 'PM 成长营', hours: '8h', focus: '五层架构拆解 / 业务链路对比 / 策略建议', url: 'https://search.bilibili.com/all?keyword=产品经理+竞品分析+拆解报告' },
      ],
      officialDoc: { label: '人人都是产品经理 · 竞品分析库', url: 'https://www.woshipm.com/' },
      selfProject: {
        title: '豆包 vs Kimi vs DeepSeek（或小红书 vs 抖音电商）全链路商业化与交互深度体验报告',
        whyHiringLikes: '作品集投递腾讯/字节/小红书产品与运营岗最硬的敲门砖',
        deliverables: ['20 页图文并茂 PDF/飞书文档作品集链接', '核心流程状态机与优化原型图'],
      },
      contests: ['全国高校商业精英挑战赛', '中国国际大学生创新大赛'],
    },
    growth_ops: {
      bilibili: [
        { title: '小红书 / 抖音从零起号实操 + 数据复盘与千川/聚光投放逻辑', author: '新媒体运营实战', hours: '14h', focus: 'CTR/完播率优化 / AB 封面测试 / 转化漏斗', url: 'https://search.bilibili.com/all?keyword=小红书+起号+运营+数据复盘+AB测试' },
      ],
      officialDoc: { label: '巨量算数 & 运营派公开数据', url: 'https://trendinsight.oceanengine.com/' },
      selfProject: {
        title: '独立从 0 启动一个垂直内容账号完成 10 篇 A/B 选题实测并输出转化漏斗复盘',
        whyHiringLikes: '真金白银的公开主页链接 + 阅读量/互动率迭代曲线，甩开“我写过几篇推文”',
        deliverables: ['公开账号主页链接', '10 篇内容的曝光-点击-互动归因表格'],
      },
      contests: ['大广赛', '全国大学生电子商务三创赛'],
    },
    new_media_ops: {
      bilibili: [
        { title: '爆款内容网感养成 + 剪映/PR 高效短视频全流程与数据驱动运营', author: '运营实战课', hours: '12h', focus: '黄金前三秒 / 选题库搭建 / 平台推荐算法逻辑', url: 'https://search.bilibili.com/all?keyword=新媒体运营+爆款逻辑+数据复盘' },
      ],
      officialDoc: { label: '新榜公开榜单与趋势洞察', url: 'https://www.newrank.cn/' },
      selfProject: {
        title: '独立运营垂直号（如 AI 效率/专业科普）30 天，建立选题库与爆款拆解手册',
        whyHiringLikes: '可验证的真实主页与迭代对比，证明你有网感和执行闭环',
        deliverables: ['账号链接', '爆款 vs 低阅读对比复盘文档'],
      },
      contests: ['全国大学生广告艺术大赛（大广赛）'],
    },
    copywriting: {
      bilibili: [
        { title: '商业文案与品牌整合营销策划实训课', author: '广告创意专题', hours: '10h', focus: '消费者洞察 / 卖点提炼 / 品牌整合传播提案', url: 'https://search.bilibili.com/all?keyword=广告文案+品牌策划+大广赛' },
      ],
      officialDoc: { label: '大广赛历届获奖作品库', url: 'https://www.sun-ada.net/' },
      selfProject: {
        title: '认领真实品牌命题输出整套传播方案 + 实际落地推文/海报测试点击率',
        whyHiringLikes: '带有真实反馈数据或获奖记录的品牌作品集',
        deliverables: ['品牌提案 PDF + 实测图文链接'],
      },
      contests: ['大广赛', '全国高校商业精英挑战赛品牌策划'],
    },
    financial_modeling: {
      bilibili: [
        { title: '投行/行研必修：财务三张表配平、DCF 估值与可比公司建模实战', author: '金融建模 / CPA 实务', hours: '18h', focus: '三表勾稽 / WACC 测算 / 敏感性矩阵', url: 'https://search.bilibili.com/all?keyword=DCF估值+三张表+财务建模+Excel' },
      ],
      officialDoc: { label: '东方财富研报与公司公告', url: 'https://data.eastmoney.com/report/' },
      selfProject: {
        title: '针对一家真实新能源/AI 龙头上市公司的完整三表预测 + DCF 敏感性 Excel 模型与深度研报',
        whyHiringLikes: '券商行研/投行/战投实习面试必收硬通货附件',
        deliverables: ['动态配平 Excel 模型', '15 页标准行研报告 PDF'],
      },
      contests: ['工行杯全国大学生金融科技创新大赛', 'CFA 全球投资分析大赛'],
    },
    industry_research: {
      bilibili: [
        { title: '买方/卖方行业研究实务：产业链拆解、专家访谈与财报交叉验证', author: '行研入门课', hours: '14h', focus: '供给需求测算 / 竞争格局 / 估值锚点', url: 'https://search.bilibili.com/all?keyword=行业研究+研报写作+产业链拆解' },
      ],
      officialDoc: { label: '巨潮资讯官方上市公司公告', url: 'http://www.cninfo.com.cn/' },
      selfProject: {
        title: '某新兴赛道（如人形机器人/低空经济）产业链全景图谱与核心标的深度研究报告',
        whyHiringLikes: '用公开招股书与年报一手数据做测算，告别复制粘贴券商研报',
        deliverables: ['原创行研报告 PDF', '产业链上下游毛利率/产能测算表'],
      },
      contests: ['全国高校商业精英挑战赛', '挑战杯'],
    },
    official_writing: {
      bilibili: [
        { title: '国家公文写作规范（GB/T 9704）与机关材料/申论高分底层逻辑', author: '体制内写作 / 申论名师', hours: '12h', focus: '请示/报告/纪要规范 / 政论文结构 / 基层调研报告', url: 'https://search.bilibili.com/all?keyword=公文写作+GB+9704+机关材料' },
      ],
      officialDoc: { label: '中国政府网政策文件库', url: 'https://www.gov.cn/zhengce/' },
      selfProject: {
        title: '结合家乡或校园治理痛点撰写一份规范调研专报 + 校级活动全套标准公文集',
        whyHiringLikes: '体制内/国央企党政办与综合管理岗最重“手头有成品材料”',
        deliverables: ['标准排版调研报告', '4 类合规公文作品集'],
      },
      contests: ['中华经典诵写讲大赛', '挑战杯社会调查'],
    },
    teaching_design: {
      bilibili: [
        { title: '教资面试/教师编无生试讲高分示范 + BOPPPS 教学设计精讲', author: '师范教学示范', hours: '14h', focus: '导入互动 / 板书结构 / 分层作业与课堂诊断', url: 'https://search.bilibili.com/all?keyword=无生试讲+教学设计+BOPPPS' },
      ],
      officialDoc: { label: '国家中小学智慧教育平台', url: 'https://basic.smartedu.cn/' },
      selfProject: {
        title: '完整录制 3 节 15 分钟无生试讲微课视频 + 配套逐字稿与学情分层教案',
        whyHiringLikes: '学校与教培机构简历初筛+面试最直接的硬凭证',
        deliverables: ['微课视频链接', '3 份完整教学设计教案'],
      },
      contests: ['全国师范生微课大赛', '“田家炳杯”全国师范院校师范生教学技能竞赛'],
    },
  };
  function selfStudyFor(skillId) {
    if (SELF_STUDY_CATALOG[skillId]) return SELF_STUDY_CATALOG[skillId];
    const name = skillName(skillId);
    const q = encodeURIComponent(name + ' 教程 实战');
    const lr = LEARNING_RESOURCES[skillId];
    return {
      bilibili: [
        { title: `B 站体系课检索：${name} 从入门到项目实战`, author: 'B站开源/机构公开课', hours: '10–20h', focus: '核心概念精讲 + 真实行业案例实操', url: `https://search.bilibili.com/all?keyword=${q}` },
      ],
      officialDoc: lr ? { label: lr[0], url: lr[1] } : { label: `GitHub 开源实战检索 (${name})`, url: `https://github.com/search?q=${encodeURIComponent(name)}&type=repositories` },
      selfProject: {
        title: `独立自研「${name}」可验证实战作品（脱离课本例题，附公开输入数据与测试记录）`,
        whyHiringLikes: '招聘方更信任你在真实业务边界下独立跑通的可复现交付物，而非仅考过期末考试',
        deliverables: ['可公开访问的仓库/作品链接', '实测对比结果与复现 README'],
      },
      contests: ['结合专业匹配学科竞赛实战验证'],
    };
  }
  function buildColdStartCourseworkGuide(p, targetReqs = []) {
    if (hasHardcoreExperience(p)) {
      return {
        needed: false,
        reason: '你已具备自研项目、学科竞赛、科研或实习等硬核经历，建议直接用这些高权重成果对标岗位，课程作业保持低权重即可。',
        items: [],
      };
    }
    const targetSkills = new Set(targetReqs.flatMap(r => (r.skills || []).map(s => s.skillId)));
    const candidateCourseIds = [...new Set([...(p.completedCourseIds || []), ...(p.inProgressCourseIds || [])])];
    const courses = candidateCourseIds.map(id => COURSE_BY_ID.get(id)).filter(Boolean);
    const fallbackPool = courses.length ? courses : coursesOfMajor(p.major).slice(0, 4);
    const items = fallbackPool.map(c => {
      const hitSkills = c.teaches.filter(sid => !targetSkills.size || targetSkills.has(sid));
      return {
        courseId: c.id,
        courseName: c.name,
        assignmentTitle: c.assignment.title,
        hitSkillNames: (hitSkills.length ? hitSkills : c.teaches).map(skillName),
        score: hitSkills.length,
        upgradeHint: c.assignment.upgradeTasks?.[0]?.title || '补充边界测试、真实数据集与公开可复现 README，包装成可展示项目',
        deliverable: c.assignment.upgradeTasks?.[0]?.deliverable || '可运行仓库与复现说明',
      };
    }).sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      needed: true,
      reason: '当前暂无实习或独立项目经历：你的课程设计（课设）与专业实验已作为冷启动核心依据接入就业匹配；先挑 1 门对口课设补充个人分工、实测数据或报告/代码链接即可投递入门实习，同时主线跟进上方 B 站体系课与自研项目！',
      items,
    };
  }
  const STATUS_FACTOR = { evidenced: 1, learned_unverified: 0.5, not_learned: 0 };
  const STATUS_MAP = { not_learned: 'UNLEARNED', learned_unverified: 'LEARNED_UNVERIFIED', evidenced: 'VERIFIED' };
  const STATUS_LABEL = { UNLEARNED: '尚未学习', LEARNED_UNVERIFIED: '学过待验证', VERIFIED: '已有证据' };
  function reverseStatusOf(p, sid) { return STATUS_MAP[skillStatusMap(p).get(sid) || 'not_learned']; }
  const DEGREE_RANK = { associate: 1, bachelor: 2, master: 3, phd: 4 };
  const DEGREE_LABEL = { associate: '大专', bachelor: '本科', master: '硕士', phd: '博士' };
  const ELIGIBILITY_LABEL = { PASS: '已核对的资格符合', FAIL: '明确门槛未满足', UNKNOWN: '资格待核验' };
  function evaluateEligibility(p, job) {
    const g = job.hardGate || {};
    const checks = [];
    const add = (key, label, actual, meets) => checks.push({ key, label,
      status: actual == null ? 'UNKNOWN' : meets(actual) ? 'PASS' : 'FAIL' });
    const unknown = (key, label) => add(key, label, null, () => false);
    const type = jobTypeOf(job);
    if (g.graduationYears?.length) add('graduation', '招聘届别 ' + g.graduationYears.join('/'), p.graduationYear, year => g.graduationYears.map(Number).includes(year));
    else if (type === 'campus') unknown('graduation', '招聘届别待核验');
    if (DEGREE_LABEL[g.minDegree]) add('degree', '最低学历 ' + DEGREE_LABEL[g.minDegree], DEGREE_RANK[p.degree] ?? null, degree => degree >= DEGREE_RANK[g.minDegree]);
    else if (job.kind !== 'competition' && g.degreeUnrestricted !== true) unknown('degree', '最低学历待核验');
    if (g.minGpaPercent != null) add('gpa', '均分 ≥' + g.minGpaPercent, p.gpaPercent, gpa => gpa >= g.minGpaPercent);
    if (g.maxRankPercent != null) add('rank', '排名前 ' + g.maxRankPercent + '%', rankPercent(p), rank => rank <= g.maxRankPercent);
    if (g.englishRequirement) unknown('english', '语言要求 ' + g.englishRequirement);
    for (const [index, label] of (g.otherGates || []).entries()) {
      if (type === 'campus' && g.graduationYears?.length && /应届.*(?:届别|校招)/.test(label)) continue;
      if (/在校生/.test(label) && p.graduationYear != null) {
        const todayMonth = new Date().toISOString().slice(0, 7);
        const gradMonth = p.graduationDate || (p.graduationYear + '-06');
        add('notes-' + index, '在校生身份（' + p.graduationYear + '届）', gradMonth >= todayMonth, Boolean);
        continue;
      }
      unknown('notes-' + index, label);
    }
    if (!checks.length && job.kind !== 'competition' && !g.degreeUnrestricted) unknown('source', '招聘资格待核验');
    const failed = checks.filter(check => check.status === 'FAIL');
    const pending = checks.filter(check => check.status === 'UNKNOWN');
    return { status: failed.length ? 'FAIL' : pending.length ? 'UNKNOWN' : 'PASS', checks, failed, pending };
  }
  const checkHardGate = (p, job) => evaluateEligibility(p, job).failed.map(check => check.label);
  function dedupeSkillsById(skills) {
    const byId = new Map();
    for (const s of skills || []) {
      const prev = byId.get(s.skillId);
      if (!prev || (s.weight || 0) > (prev.weight || 0)) byId.set(s.skillId, s);
    }
    return [...byId.values()];
  }
  function coverageOf(status, req) {
    let weighted = 0, total = 0;
    const covered = [], missing = [];
    for (const s of dedupeSkillsById(req.skills)) {
      total += s.weight;
      const st = status.get(s.skillId) || 'not_learned';
      weighted += s.weight * STATUS_FACTOR[st];
      if (st === 'not_learned') missing.push(s.skillId); else covered.push(s.skillId);
    }
    return { weightedCoverage: total === 0 ? 0 : round3(weighted / total), coveredSkillIds: covered, missingSkillIds: missing };
  }
  function forwardMatch(p, reqs, now = new Date()) {
    if (p.personalized === false) p = { completedCourseIds: [], evidences: [], preferences: {} };
    const status = skillStatusMap(p);
    const profileSignals = matchProfileSignals(p, now);
    const all = reqs.map((req) => {
      const eligibility = evaluateEligibility(p, req);
      const cov = coverageOf(status, req);
      const freshness = jobFreshness(req, now);
      const majorAlignment = majorAlignmentOf(p, req);
      const factors = matchFactors(p, profileSignals, req, majorAlignment, cov);
      const matchScore = scoreMatchFactors(factors, MATCH_WEIGHTS);
      const completeness = [req.skills.length > 0, !!req.jdText,
        eligibility.checks.some(check => check.key === 'degree' && req.hardGate?.minDegree),
        jobTypeOf(req) !== 'campus' || !!req.hardGate?.graduationYears?.length].filter(Boolean).length / 4;
      const confidence = round3(0.35 * completeness + 0.30 * profileSignals.completeness
        + 0.20 * sourceReliability(req) + 0.15 * freshness.score);
      const result = { req, matchVersion: MATCH_VERSION, schemaVersion: EMPLOYMENT_SCHEMA_VERSION, calculatedAt: now.toISOString(), eligibility,
        matchScore, confidence, factors, freshness, majorAlignment, projectRelevance: factors.project,
        evidenceRefs: [...new Set(req.skills.flatMap(skill => profileSignals.evidenceRefs.get(skill.skillId) || []))],
        missingCount: cov.missingSkillIds.length, ...cov };
      const { tier, reason } = recommendTierOf(result);
      return { ...result, tier, tierReason: reason };
    });
    return { all: all.sort(compareMatches) };
  }

  /* ---- 技能缺口（只聚合目标需求技能，行动建议模板确定性生成） ---- */
  function gapAction(st, courseIds, completed) {
    if (st === 'evidenced') return '已有可核验证据，可直接用于岗位匹配与有据简历。';
    const uncompleted = courseIds.filter((id) => !completed.includes(id));
    const completedHere = courseIds.filter((id) => completed.includes(id));
    if (st === 'learned_unverified') {
      const names = completedHere.map((id) => '《' + courseName(id) + '》').join('、');
      return names ? '已修 ' + names + '，可把课程作业升级为可核验成果。'
        : '已有学习或成果记录，可补充作品与验证说明。';
    }
    if (uncompleted.length) {
      const names = uncompleted.slice(0, 2).map((id) => '《' + courseName(id) + '》').join('、');
      return '尚未修读：优先修 ' + names + '，并完成配套作业升级任务积累证据。';
    }
    if (completedHere.length) return '课程已覆盖但证据不足：重做《' + courseName(completedHere[0]) + '》作业并补充可核验交付物。';
    return '培养方案未覆盖：通过选修、竞赛或项目实战补齐，并保留可核验交付物。';
  }
  function computeGaps(p, targetReqIds) {
    const status = skillStatusMap(p);
    const required = new Map();
    const targets=distinctPostings(targetReqIds.map(id=>REQ_BY_ID.get(id)).filter(Boolean));
    for (const req of targets) {
      const rid=req.id;
      for (const s of req.skills) {
        const e = required.get(s.skillId) || { maxWeight: 0, reqIds: [] };
        e.maxWeight = Math.max(e.maxWeight, s.weight);
        if (!e.reqIds.includes(rid)) e.reqIds.push(rid);
        required.set(s.skillId, e);
      }
    }
    const courses = coursesOfMajor(p.major);
    const items = [];
    for (const [sid, req] of required) {
      const st = status.get(sid) || 'not_learned';
      const relatedCourseIds = courses.filter((c) => c.teaches.includes(sid)).map((c) => c.id);
      const evidenceIds = p.evidences.filter((ev) => ev.skillIds.includes(sid)).map((ev) => ev.id);
      const tasks = D.courses.flatMap(c => c.assignment.upgradeTasks).filter(task => task.skillId === sid);
      const task = tasks.slice().sort((a, b) => a.estimatedHours - b.estimatedHours)[0];
      const hoursRange=roadmapHoursOf(sid,task);
      const hours=Math.ceil((hoursRange[0]+hoursRange[1])/2);
      const jobCoverage = req.reqIds.length / Math.max(1, targets.length);
      const priority = round3(req.maxWeight * (1 - STATUS_FACTOR[st]) * jobCoverage * (st === 'learned_unverified' ? 1 : 0.75)
        * (task||ROADMAP_EXERCISES[sid] ? 1 : 0.65) / hours);
      items.push({ skillId: sid, skillName: skillName(sid), status: st, requiredByReqIds: req.reqIds, jobCoverage, hours, hoursRange, priority,
        estimated: !task&&!ROADMAP_EXERCISES[sid], task: task || null, maxWeight: req.maxWeight, relatedCourseIds, evidenceIds,
        action: gapAction(st, relatedCourseIds, p.completedCourseIds) });
    }
    const order = { not_learned: 0, learned_unverified: 1, evidenced: 2 };
    return items.sort((a, b) => b.priority - a.priority || order[a.status] - order[b.status] || b.maxWeight - a.maxWeight);
  }
  function simulateGapImpact(p, gap, now = new Date()) {
    const jobs = gap.requiredByReqIds.map(id => REQ_BY_ID.get(id)).filter(req => req?.kind === 'job');
    const current=forwardMatch(p,jobs,now).all;
    const baseline=new Map(current.filter(match=>!match.freshness.ended&&match.eligibility.status!=='FAIL').map(match=>[match.req.id,match]));
    const evidence={id:'simulation',type:'项目',skillIds:[gap.skillId],verificationStatus:'user_confirmed',
      observedAt:now.toISOString(),hasPortfolio:true};
    const simulated=forwardMatch({...p,evidences:[...p.evidences,evidence]},[...baseline.values()].map(match=>match.req),now).all;
    const deltas=[],moves=new Map();
    let newlyScored=0,reduced=0;
    for(const match of simulated){
      const before=baseline.get(match.req.id);
      if(before.matchScore==null&&match.matchScore!=null) newlyScored++;
      else if(before.matchScore!=null&&match.matchScore!=null){
        if(match.matchScore>before.matchScore) deltas.push(match.matchScore-before.matchScore);
        if(match.matchScore<before.matchScore) reduced++;
      }
      if(TIER_ORDER[match.tier]<TIER_ORDER[before.tier]){
        const key=before.tier+':'+match.tier;
        const move=moves.get(key)||{from:before.tier,to:match.tier,count:0};
        move.count++;
        moves.set(key,move);
      }
    }
    return {min:deltas.length?Math.min(...deltas):null,max:deltas.length?Math.max(...deltas):null,improved:deltas.length,
      newlyScored,reduced,evaluated:baseline.size,excluded:current.length-baseline.size,promotions:[...moves.values()]};
  }

  const GENERIC_SKILL_IDS = new Set(['teamwork_comm', 'logic_expression', 'office_advanced', 'project_mgmt', 'programming_basics']);
  const ROADMAP_EXERCISES = {
    industrial_bus: {
      title:'验证 CAN 报文收发', prerequisites:['embedded_c'],
      steps:['准备支持 SocketCAN 的 Linux 环境，使用虚拟 CAN 接口。','编写发送与接收程序，记录报文 ID、载荷及时间。','增加一条不匹配 ID 的过滤用例，保存原始日志。'],
      tools:'Linux SocketCAN、vcan、can-utils', resource:['Linux SocketCAN 文档','https://www.kernel.org/doc/html/latest/networking/can.html'],
      deliverable:'收发代码、复现说明与过滤测试日志', criteria:['指定 ID 和载荷能从发送端到达接收端。','非目标 ID 被过滤，日志能区分两个用例。'],
      hours:[5,9], cost:'已有 Linux 或虚拟机即可练习，无需购买开发板。',
    },
    web_frontend: {
      title:'验证页面完整交互流程', prerequisites:['javascript'],
      steps:['选取一个列表或表单页面，记录数据输入和预期界面。','实现空数据与提交失败状态。','测试正常和失败流程，保存结果与复现步骤。'],
      tools:'浏览器开发工具、Playwright', resource:['Playwright 官方测试指南','https://playwright.dev/docs/writing-tests'],
      deliverable:'可运行页面、流程用例及结果记录', criteria:['有效操作能更新页面，刷新后行为符合预期。','失败或空数据状态有可观察反馈。'],
      hours:[4,8], cost:'使用本地浏览器与开源测试工具。',
    },
    python: {
      title:'实现可复现的 Python 小工具', prerequisites:[],
      steps:['选择一个可用公开或自造数据表达的小问题，定义输入与输出。','实现核心逻辑，并用参数或文件输入运行。','验证正常、空输入和错误格式，记录命令和结果。'],
      tools:'Python、标准库测试工具', resource:['Python 官方教程','https://docs.python.org/zh-cn/3/tutorial/index.html'],
      deliverable:'源码、样例数据、复现说明与回归记录', criteria:['给定样例可按说明复现预期输出。','空输入或错误格式能被明确处理。'],
      hours:[3,6], cost:'本机可运行，使用公开或自造数据。',
    },
    software_testing: {
      title:'为个人演示项目补回归测试', prerequisites:[],
      steps:['选一条自己控制的演示页面核心流程，写下成功与失败预期。','加入一条正常路径和一条边界路径的断言。','保留测试通过记录，并记录引入预期错误后的失败结果。'],
      tools:'Playwright 或项目现有测试框架', resource:['Playwright 官方测试指南','https://playwright.dev/docs/writing-tests'],
      deliverable:'可复跑测试、结果报告及失败诊断', criteria:['两个用例分别覆盖正常和边界行为。','引入对应回归时，断言在预期位置失败。'],
      hours:[4,7], cost:'使用本机和开源测试工具。',
    },
    data_analysis: {
      title:'做一份可复现的数据分析', prerequisites:['python'],
      steps:['选择公开或自造数据，记录字段、清洗规则和指标口径。','处理缺失值与重复值，计算分组指标。','保存可重跑代码，并对照两种处理策略的结果。'],
      tools:'Python、pandas', resource:['pandas 官方入门教程','https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html'],
      deliverable:'分析脚本、数据说明和结果对照表', criteria:['按文档可从原始样例生成结果。','说明缺失和去重策略如何影响至少一个指标。'],
      hours:[4,8], cost:'使用本地开源工具和公开或自造数据。',
    },
    llm_app_dev: {
      title:'构建 RAG / Agent 工具调用与评测闭环', prerequisites:['python'],
      steps:['选定具体垂直场景（如技术文档问答或结构化抽取），准备 15–20 条真实测试样本。','基于本机 Ollama (千问 3.8) 或标准接口实现检索增强 / Function Calling 与输出 Schema 校验。','编写评测脚本记录基线与改进方案的准确率、延迟及至少 2 类 Badcase 归因。'],
      tools:'Python、Ollama (千问 3.8) / OpenAI SDK、结构化校验', resource:null,
      deliverable:'可运行源码仓库、评测数据集与基线对比报告', criteria:['给定测试集可按 README 复现完整推理、工具调用与结构化校验流程。','附基线与改进方案的量化评测对照表及至少 2 条失败边界样例分析。'],
      hours:[6,10], cost:'直接复用本机 Ollama 千问模型与开源工具，零额外费用。',
    },
    deep_learning: {
      title:'完成深度学习基线训练与消融评测', prerequisites:['python'],
      steps:['选用公开小规模数据集，固定随机种子与训练/验证划分。','训练基线模型并对比一项明确改动（如学习率调度、正则或特征融合）。','保存训练曲线、评测指标与典型误判样本分析。'],
      tools:'Python、PyTorch', resource:null,
      deliverable:'训练与评测脚本、实验配置及消融结果表', criteria:['固定随机种子后可按说明复现训练与验证评测输出。','清晰对比基线与改动方案指标，并分析至少 2 类典型误判样例。'],
      hours:[6,12], cost:'本机 GPU 或公开免费算力环境运行。',
    },
    nlp: {
      title:'实现文本分类或抽取流水线与误差分析', prerequisites:['python'],
      steps:['准备公开中文/英文文本样本，明确标签定义与评价指标（F1/Exact Match）。','搭建分词/Embedding 特征或预训练微调基线并输出预测结果。','统计混淆矩阵并针对高频错例做一次规则或数据清洗改进。'],
      tools:'Python、HuggingFace / scikit-learn', resource:null,
      deliverable:'文本处理与评测代码、指标对比表与错例归因记录', criteria:['从原始测试集可一键跑出前后两次评测指标。','给出具体错例分类及改进前后的对比证据。'],
      hours:[5,10], cost:'本机开源环境即可完成。',
    },
    ml_basics: {
      title:'构建防数据泄漏的特征工程与分类基准', prerequisites:['python'],
      steps:['使用 Pipeline 封装预处理与模型训练，确保验证集不参与拟合。','对比两种经典模型（如逻辑回归 vs 树模型）在同折验证下的表现。','输出混淆矩阵、PR/ROC 指标与特征重要性核查。'],
      tools:'Python、scikit-learn', resource:null,
      deliverable:'Pipeline 脚本、交叉验证结果与误判分析', criteria:['训练与测试切分严格隔离，脚本可复跑出一致指标。','包含模型对比表与类别不平衡或边界样本处理说明。'],
      hours:[4,8], cost:'本机开源工具运行。',
    },
    java: {
      title:'实现并发安全与异常边界完备的 Java 服务模块', prerequisites:[],
      steps:['围绕具体业务场景设计领域对象、接口契约与错误码。','实现核心逻辑并处理空值、超时或并发竞争场景。','编写 JUnit 单元测试覆盖正常流与异常回滚。'],
      tools:'JDK、Maven/Gradle、JUnit', resource:null,
      deliverable:'Java 工程源码、单元测试套件与运行日志', criteria:['mvn/gradle test 可直接跑通全部正常与异常边界断言。','关键并发或异常分支有明确验证用例。'],
      hours:[5,9], cost:'本机开源 JDK 环境。',
    },
    spring_boot: {
      title:'搭建含参数校验与集成测试的 Spring Boot 接口', prerequisites:['java'],
      steps:['定义 REST 接口、DTO 校验规则与数据库读写层。','加入分页查询、统一异常处理与事务边界。','使用 MockMvc / Testcontainers 完成正常与非法入参集成测试。'],
      tools:'Java、Spring Boot、MySQL/SQLite', resource:null,
      deliverable:'Spring Boot 服务源码、API 示例与集成测试报告', criteria:['接口在正常、空结果与非法参数下返回预期状态码与结构。','集成测试可在本机独立复跑通过。'],
      hours:[6,10], cost:'本机开源环境运行。',
    },
    sql_rdbms: {
      title:'设计业务表结构并用 EXPLAIN 验证索引优化', prerequisites:[],
      steps:['设计含主外键约束与复合查询需求的 2–3 张关联表并灌入测试数据。','编写聚合统计与分页慢查询 SQL，记录优化前 EXPLAIN 执行计划。','建立合适索引或改写查询，对比优化前后扫描行数与耗时。'],
      tools:'PostgreSQL / MySQL / SQLite', resource:['PostgreSQL 官方文档','https://www.postgresql.org/docs/'],
      deliverable:'建表与查询 SQL、测试数据生成脚本及 EXPLAIN 前后对照', criteria:['SQL 脚本可从空库建表并复现查询结果。','提供加索引前后的执行计划或扫描行数实测对比。'],
      hours:[4,8], cost:'本机开源数据库环境。',
    },
    linux_deploy: {
      title:'容器化部署后端服务并验证健康检查与日志排障', prerequisites:[],
      steps:['为现有 Web/API 服务编写最小化 Dockerfile 与 Compose 配置。','配置环境变量隔离、健康检查探针与日志输出。','模拟下游超时或端口异常，记录定位与恢复命令链路。'],
      tools:'Linux / WSL、Docker Compose', resource:null,
      deliverable:'Dockerfile/Compose 配置、启动验证脚本与故障演练记录', criteria:['单条命令可拉起服务并通过健康检查接口验证。','包含一次异常注入后的日志排障与恢复实录。'],
      hours:[4,8], cost:'本机 Docker / WSL 环境。',
    },
    algorithms: {
      title:'针对实际检索/调度问题完成复杂度优化与压测', prerequisites:[],
      steps:['从项目或赛题中选定一个存在性能瓶颈的查找、图遍历或动态规划子问题。','分别实现朴素基线与优化数据结构/算法版本，并以对拍保证结果一致。','在 ≥3 组量级输入下实测耗时与内存占用，绘制对比表。'],
      tools:'C++ / Python / Java', resource:null,
      deliverable:'双版本源码、随机对拍脚本与多规模耗时实测表', criteria:['随机测试集下优化版与基线版输出 100% 一致。','提供至少 3 个数据规模下的真实运行耗时对比。'],
      hours:[4,7], cost:'本机编译器/解释器环境。',
    },
    golang: {
      title:'构建 Go Gin 并发微服务与 Benchmark 基准测试', prerequisites:[],
      steps:['使用 Gin + GORM/SQLite 设计轻量级短链或分布式任务调度服务，实现优雅停机与统一错误码。','用 Goroutine + Channel 实现异步消费或限流器，并避免数据竞争（`go test -race`）。','使用 `go test -bench` 与 `pprof` 输出并发吞吐与内存分配对比。'],
      tools:'Go 1.22+、Gin、pprof', resource:['Go 官方 Effective Go','https://go.dev/doc/effective_go'],
      deliverable:'Go 工程源码、`go test -race` 全绿记录与 Benchmark 报告', criteria:['并发安全检测（-race）零告警通过。','提供基准压测数据与 pprof 热点定位说明。'],
      hours:[6,10], cost:'本机开源 Go 工具链。',
    },
    cpp_modern: {
      title:'实现现代 C++ RAII 线程池与内存安全验证', prerequisites:[],
      steps:['基于 C++17 标准实现支持任务队列与 `std::future` 返回值的固定/动态线程池。','使用智能指针与移动语义消除裸指针泄漏，编写高频并发压测程序。','开启 `-fsanitize=address,thread` 编译验证零内存越界与竞态。'],
      tools:'GCC/Clang (C++17)、CMake、ASan/TSan', resource:['cppreference','https://en.cppreference.com/w/'],
      deliverable:'CMake 工程源码、ASan/TSan 零报错日志与吞吐测试表', criteria:['开启 AddressSanitizer 与 ThreadSanitizer 连续压测无报错。','对比单线程与多线程耗时曲线。'],
      hours:[6,10], cost:'本机开源 C++ 工具链。',
    },
    redis: {
      title:'用 Redis + Lua 实现防超卖分布式锁与缓存击穿演练', prerequisites:[],
      steps:['搭建本地 Redis 实例，编写 Lua 原子脚本实现令牌桶限流或库存防超卖扣减。','构造热点 Key 突然失效并发场景，分别测试无防护与逻辑过期/互斥锁方案的 DB 穿透率。','记录压测前后 QPS 与数据库请求数对照表。'],
      tools:'Redis、Python/Java/Go、压测脚本', resource:['Redis 官方文档','https://redis.io/docs/latest/'],
      deliverable:'Lua 脚本、压测脚本与击穿对比实测报告', criteria:['100 并发抢购下库存零超卖且幂等校验通过。','提供击穿前后数据库命中次数对比。'],
      hours:[4,8], cost:'本机 Redis/Docker 环境。',
    },
    mq_kafka: {
      title:'搭建 Kafka/RabbitMQ 异步削峰与消费幂等验证管线', prerequisites:[],
      steps:['用 Docker Compose 启动单节点消息队列与消费者服务，定义消息结构与幂等 Key。','模拟消费者崩溃重启与消息重复投递场景，验证手动 ACK 与死信队列兜底。','对比同步写库与消息队列削峰在突发流量下的响应延迟。'],
      tools:'Docker Compose、Kafka/RabbitMQ', resource:['Apache Kafka 文档','https://kafka.apache.org/documentation/'],
      deliverable:'Compose 编排、生产者/消费者源码与重复消费防重实录', criteria:['重复投递同一消息 3 次最终业务状态仅生效 1 次。','死信队列能捕获异常消息并保留排查日志。'],
      hours:[5,9], cost:'本机 Docker 环境。',
    },
    cloud_k8s: {
      title:'基于 Docker + CI/CD 跑通容器编排与零停机升级', prerequisites:['linux_deploy'],
      steps:['为前后端或微服务编写多阶段构建 Dockerfile，将镜像体积压缩至最小。','编写 GitHub Actions 或本地脚本自动执行单测、构建镜像与健康检查验证。','在本地 Kind/k3s 或 Compose 下演练滚动更新与探针就绪检查。'],
      tools:'Docker、Kubernetes (Kind/k3s)、GitHub Actions', resource:['Kubernetes 官方文档','https://kubernetes.io/docs/home/'],
      deliverable:'Dockerfile、K8s/CI 配置文件与滚动发布验证记录', criteria:['代码提交或脚本触发可自动完成构建与测试验证。','包含就绪探针配置与失败回滚说明。'],
      hours:[5,9], cost:'本机开源容器工具链。',
    },
    computer_vision: {
      title:'完成 YOLOv8/OpenCV 视觉检测与 ONNX 推理加速实测', prerequisites:['python'],
      steps:['选取公开工业缺陷或交通目标小数据集，完成标注检查与训练/验证切分。','训练基线检测模型并导出为 ONNX 格式，对比 PyTorch 原生与 ONNX Runtime 推理延迟。','统计 mAP 与至少 3 张典型误检/漏检边界样例分析。'],
      tools:'Python、PyTorch、OpenCV、ONNX Runtime', resource:['OpenCV 官方文档','https://docs.opencv.org/4.x/'],
      deliverable:'训练与导出脚本、推理耗时对比表与 Badcase 截图', criteria:['可一键运行 ONNX 推理输出带框检测图与延迟数据。','明确记录 PyTorch vs ONNX 耗时及误检原因。'],
      hours:[6,11], cost:'本机环境或免费公开 Colab 算力。',
    },
    ros_slam: {
      title:'在 Gazebo 仿真中跑通 ROS2 SLAM 建图与 Nav2 避障', prerequisites:['embedded_c'],
      steps:['搭建 ROS2 Humble 环境与 TurtleBot3/差速小车 Gazebo 仿真世界。','启动 SLAM Toolbox 完成未知室内地图构建，保存栅格地图文件。','配置 Nav2 局部/全局代价地图参数，实测静态与动态障碍物绕行成功率。'],
      tools:'Ubuntu / Docker、ROS2 Humble、Gazebo、RViz2', resource:['ROS2 官方文档','https://docs.ros.org/en/humble/'],
      deliverable:'ROS2 启动包、构建地图产物与 Nav2 调参对比记录', criteria:['无需实体机器人即可在 Gazebo 完整复现建图与导航。','记录两组不同膨胀半径参数对窄道通过率的影响。'],
      hours:[6,12], cost:'本机 Linux/Docker 仿真环境，无需购买底盘。',
    },
    fpga_verilog: {
      title:'手写异步 FIFO + 状态机并完成 Verilator/ModelSim 波形验证', prerequisites:[],
      steps:['使用 Verilog 实现带格雷码同步的异步 FIFO（跨时钟域 CDC）及空满标志逻辑。','编写完备 Testbench，分别覆盖不同读写时钟频率、连续写满与连续读空边界。','导出关键节点时序波形截图，并补充亚稳态与两级触发器打拍说明。'],
      tools:'Verilog、Icarus Verilog / Verilator / GTKWave', resource:['HDLBits 刷题平台','https://hdlbits.01xz.net/'],
      deliverable:'RTL 源码、Testbench 与波形对比截图', criteria:['仿真器跑通跨时钟域异步读写断言零数据丢失。','清晰标注空满标志产生与同步延时波形。'],
      hours:[6,10], cost:'本机开源 Verilog 仿真工具链。',
    },
    ai_agent_workflow: {
      title:'构建多工具协作 Agent 与结构化校验评测闭环', prerequisites:['python'],
      steps:['围绕真实校招或知识检索场景设计至少 2 个外部工具（如检索工具 + 规则校验器）。','实现带 JSON Schema 校验、超限重试与防 Prompt 注入隔离的 Agent 编排链路。','构建 15 条边界测试用例，量化统计工具调用准确率与兜底降级率。'],
      tools:'Python / TypeScript、MCP / LangGraph、千问 API', resource:['MCP 官方规范','https://modelcontextprotocol.io/'],
      deliverable:'可运行 Agent 工程、Schema 契约与 15 条评测对照表', criteria:['恶意指令注入测试能被拦截，Schema 校验 100% 合法。','输出基线对比改进后的工具调用成功率。'],
      hours:[5,9], cost:'复用本机或云端大模型接口。',
    },
    sql_bi: {
      title:'搭建电商/业务指标多维钻取 BI 看板与异动归因手册', prerequisites:['data_analysis'],
      steps:['准备公开电商或金融时序明细数据，定义 GMV、复购率、转化漏斗核心指标口径。','使用 PowerBI / Tableau / Apache Superset 搭建支持日期与品类下钻的交互看板。','模拟某一时段转化暴跌 20%，输出从维度拆解到原因定位的标准化复盘文档。'],
      tools:'Power BI Desktop / Superset / SQL', resource:null,
      deliverable:'看板文件/截图、SQL 取数口径字典与异动归因报告', criteria:['看板各指标与底层 SQL 聚合口径完全核对一致。','附一份可复用的漏斗异常定位 SOP。'],
      hours:[4,8], cost:'免费开源或社区版桌面工具。',
    },
    market_research: {
      title:'完成 10+ 深度用户访谈与竞品矩阵（真实产品作品集）', prerequisites:[],
      steps:['选定一款真实在用产品，设计非引导式访谈提纲并访谈至少 8–10 名真实目标用户。','整理痛点频次统计与 Kano/RICE 需求优先级矩阵。','对比 3 家主流竞品核心交互路径，产出一页纸改版建议原型。'],
      tools:'飞书文档 / Figma / 问卷星', resource:['人人都是产品经理','https://www.woshipm.com/'],
      deliverable:'脱敏访谈纪要、需求优先级表与改版原型对比图', criteria:['每条痛点结论均可回溯至具体受访者原话编号。','竞品对比维度 ≥6 项并明确给出取舍理由。'],
      hours:[6,10], cost:'零成本校内外实操调研。',
    },
    competitive_analysis: {
      title:'撰写商业级 3 强竞品深度拆解与原型优化方案', prerequisites:[],
      steps:['锁定赛道内 3 款标杆产品，从战略定位、核心功能流、商业化变现三层完整拆解。','亲手绘制核心业务流程图与状态机差异对比表。','聚焦 1 个具体体验痛点设计高保真优化方案与预期指标假设。'],
      tools:'Figma / 墨刀 / 飞书文档', resource:['人人都是产品经理','https://www.woshipm.com/'],
      deliverable:'商业级竞品分析作品集 PDF + 核心流程对比图', criteria:['包含真实体验截图对比与可量化的改版验证指标定义。','避免堆砌官网介绍，全部基于亲自走查体验。'],
      hours:[5,9], cost:'零成本公开产品实测。',
    },
    growth_ops: {
      title:'完成垂直账号冷启动 A/B 选题实测与漏斗复盘', prerequisites:[],
      steps:['在小红书/B站/公众号开启或接手一个垂直账号，设定目标人群与核心指标（CTR/完播率）。','针对同一主题设计 2 组不同封面/标题的 A/B 对照内容并实际发布。','收集 7 天真实后台数据，输出归因结论与下一轮迭代策略。'],
      tools:'小红书/B站后台数据、Excel', resource:null,
      deliverable:'公开账号/内容链接、A/B 数据对照表与迭代复盘文档', criteria:['提供真实发布链接与前后两组曝光-点击率数据对比。','明确指出 1 个无效假设与 1 个有效提升动作。'],
      hours:[5,9], cost:'零成本公开自媒体平台实战。',
    },
    financial_modeling: {
      title:'独立搭建真实上市公司三张表配平与 DCF 敏感性模型', prerequisites:[],
      steps:['从巨潮资讯下载目标行业龙头近 3 年真实年报与最新季报数据。','在 Excel 搭建利润表、资产负债表、现金流量表联动预测模型并确保资产=负债+权益严格配平。','加入 WACC 与永续增长率二维敏感性矩阵，撰写 1 页核心投资备忘录。'],
      tools:'Excel、巨潮资讯公告', resource:['巨潮资讯官方公告库','http://www.cninfo.com.cn/'],
      deliverable:'动态配平 Excel 建模文件 + 1 页估值备忘录 PDF', criteria:['修改营收增长率假设时三表自动重算且配平差值为 0。','每一项历史数据标注具体年报页码出处。'],
      hours:[6,10], cost:'零成本公开财报数据。',
    },
  };
  function roadmapHoursOf(skillId,template){
    if(ROADMAP_EXERCISES[skillId]) return ROADMAP_EXERCISES[skillId].hours;
    const hours=template?.estimatedHours;
    return hours?[Math.max(1,Math.floor(hours*0.8)),Math.ceil(hours*1.25)]:[8,16];
  }
  function roadmapTaskOf(gap,context) {
    const exercise=ROADMAP_EXERCISES[gap.skillId];
    const study=selfStudyFor(gap.skillId);
    const rawTemplate=gap.task;
    const rawCourse=rawTemplate&&D.courses.find(item=>item.assignment.upgradeTasks.some(task=>task.id===rawTemplate.id));
    const course=rawCourse&&(!context?.major||rawCourse.major===context.major)?rawCourse:null;
    const template=course?rawTemplate:null;
    const resource=exercise?.resource||LEARNING_RESOURCES[gap.skillId]||(study.officialDoc?[study.officialDoc.label,study.officialDoc.url]:null);
    const title=exercise?.title||study.selfProject?.title||template?.title||'自研「'+gap.skillName+'」工程验证实战项目';
    const deliverable=exercise?.deliverable||study.selfProject?.deliverables?.join('、')||template?.deliverable||'可复现源码/作品链接、验证数据与检查记录';
    const criteria=exercise?.criteria||(template?[template.acceptance,'交付物中可定位本人完成的部分和一条实际验证记录。']:
      ['用独立样例展示该技能的输入、处理与输出。','写清本人贡献、验证步骤及至少一个边界情况。']);
    const hours=exercise?exercise.hours:(gap.hoursRange||roadmapHoursOf(gap.skillId,template));
    const prerequisites=exercise?.prerequisites.map(skillName)||course?.prereq.map(courseName)||[];
    const missingPrerequisites=context?(exercise
      ?exercise.prerequisites.filter(id=>!context.skillStates.has(id)).map(skillName)
      :(course?.prereq||[]).filter(id=>!context.completedCourseIds.includes(id)).map(courseName)):[];
    const weeklyHours=context?.weeklyHours;
    const schedule=weeklyHours?{weeks:hours.map(value=>Math.ceil(value/weeklyHours)),
      twoWeekFit:hours[1]<=weeklyHours*2?'fits':hours[0]<=weeklyHours*2?'possible':'over'}:null;
    return { id:'roadmap-v1:'+gap.skillId, skillId:gap.skillId, skillName:gap.skillName, title, deliverable, criteria, resource,
      selfStudy: study,
      steps:exercise?.steps||['通过 B 站体系课与官方文档夯实核心机制与工程边界。','独立实现「'+deliverable+'」并上传公开仓库/作品链接。','按验收标准自检，记录正常路径与至少一个异常边界实测数据。'],
      prerequisites,missingPrerequisites,schedule,
      tools:exercise?.tools||'按目标岗位 JD 原文技术栈选用开源工具',
      hours,
      timeBasis:exercise?'按自学理解、独立实现与压测验收三个阶段估算。':'自研实战项目的通用工时范围，可按当前基础灵活调整。',
      cost:exercise?.cost||'优先复用 B 站免费公开课与本机开源工具，零额外费用。',
      priority:gap.priority, jobCount:gap.requiredByReqIds.length };
  }
  function roadmapTasksOf(gaps, submissions = {}, profile = null) {
    const context=profile?{major:profile.major||null,weeklyHours:profile.weeklyHours,skillStates:skillStatusMap(profile),completedCourseIds:profile.completedCourseIds}:null;
    const tasks=gaps.filter(gap=>gap.status!=='evidenced'||Object.hasOwn(submissions,'roadmap-v1:'+gap.skillId))
      .map(gap=>({...roadmapTaskOf(gap,context),complete:gap.status==='evidenced'}));
    const fit={fits:0,possible:1,over:2};
    return tasks.sort((a,b)=>Number(a.complete)-Number(b.complete)||Number(GENERIC_SKILL_IDS.has(a.skillId))-Number(GENERIC_SKILL_IDS.has(b.skillId))||
      Number(!!a.missingPrerequisites.length)-Number(!!b.missingPrerequisites.length)||
      (fit[a.schedule?.twoWeekFit]??0)-(fit[b.schedule?.twoWeekFit]??0)||b.priority-a.priority||b.jobCount-a.jobCount);
  }
  function reviewRoadmapEvidence(task, submission) {
    const notes=Array.isArray(submission.notes)?submission.notes:[];
    const criteria=task.criteria.map((text,index)=>({
      text, note:String(notes[index]||'').trim(),
    })).map(criterion=>({...criterion,status:criterion.note?'reported':'missing'}));
    const allReported=criteria.every(criterion=>criterion.status==='reported');
    const link=submission.artifactUrl||'';
    const url=/^https?:\/\//i.test(link)&&URL.canParse(link)?new URL(link):null;
    const hasArtifact=!!url&&!url.username&&!url.password;
    return { criteria, hasArtifact, readyForReview:allReported&&hasArtifact,
      status:allReported&&hasArtifact?'review_ready':criteria.some(criterion=>criterion.note)||hasArtifact?'partial':'missing' };
  }

  /* ---- 逆向目标分析：三态 + 课本专业优先/跨专业兜底 + 作业升级 ---- */
  function recommend(st, name, ownUncompleted, crossUncompleted, completedHere, linkedEvidence, completed) {
    if (st === 'VERIFIED') {
      const titles = linkedEvidence.map((ev) => '「' + ev.title + '」').join('、');
      const note = linkedEvidence.every(hasVerifiedEvidence)
        ? '证据已核验，可直接进有据简历。'
        : '已有证据可进简历，但未核验量化指标仍显示 ' + PLACEHOLDER + '，严禁编造。';
      return note + '关联证据：' + titles + '。';
    }
    if (st === 'LEARNED_UNVERIFIED') {
      if (linkedEvidence.length && !completedHere.length) return '成果已关联此技能。补交作品或可检查的交付物，再确认成果。';
      const names = completedHere.map((id) => '《' + courseName(id) + '》').join('、');
      const c = COURSE_BY_ID.get(completedHere[0]);
      const assignment = c ? c.assignment.title : '期末大作业';
      return '学过无证据：把' + (names || '相关课程') + '作业「' + assignment + '」升级为可核验交付物（见作业升级），即可转为已有证据。';
    }
    if (ownUncompleted.length) {
      const first = ownUncompleted[0];
      const unmet = first.prereq.filter((x) => COURSE_BY_ID.has(x) && !completed.has(x));
      const note = unmet.length === 0 ? '先修已满足，可直接选修' : '需先补先修（' + unmet.map(courseName).join('、') + '）';
      return '尚未学习：优先选修本专业《' + courseName(first.id) + '》（' + note + '），并完成配套作业升级积累证据。';
    }
    if (crossUncompleted.length) {
      const names = crossUncompleted.slice(0, 2).map((c) => '《' + courseName(c.id) + '》').join('、');
      return '本专业培养方案未覆盖「' + name + '」：可跨专业选修 ' + names + '，或通过自学 / 竞赛 / 项目实战补齐并保留可核验交付物。';
    }
    return '课程图谱未覆盖「' + name + '」：通过自学模块、竞赛或项目实战补齐，并保留可核验交付物。';
  }
  function analyzeTargets(p, input) {
    const required = new Map();
    const unrecognized = [];
    const targetReqIds = [];
    const add = (sid, weight, rid, subTag) => {
      const e = required.get(sid) || { maxWeight: 0, reqIds: [], subTags: new Set() };
      e.maxWeight = Math.max(e.maxWeight, weight);
      if (rid && !e.reqIds.includes(rid)) e.reqIds.push(rid);
      if (subTag) e.subTags.add(subTag);
      required.set(sid, e);
    };
    const ids=input.reqIds||[];
    unrecognized.push(...ids.filter(id=>!REQ_BY_ID.has(id)));
    for (const req of distinctPostings(ids.map(id=>REQ_BY_ID.get(id)).filter(Boolean))) {
      targetReqIds.push(req.id);
      for (const s of req.skills) add(s.skillId, s.weight, req.id);
    }
    for (const raw of input.skillIds || []) {
      if (SKILL_BY_ID.has(raw)) { add(raw, 0.5, null); continue; }
      const n = normalizeSkill(raw);
      if (!n) { unrecognized.push(raw); continue; }
      add(n.skillId, 0.5, null, n.subTag);
    }
    if (input.jdText && input.jdText.trim())
      for (const n of extractSkillsFromText(input.jdText)) add(n.skillId, 0.5, null, n.subTag);

    const status = skillStatusMap(p);
    const completed = new Set(p.completedCourseIds);
    const ownCourses = coursesOfMajor(p.major);
    const skills = [];
    for (const [sid, req] of required) {
      const st = STATUS_MAP[status.get(sid) || 'not_learned'];
      const teaching = D.courses.filter((c) => c.teaches.includes(sid));
      const completedHere = teaching.filter((c) => completed.has(c.id)).map((c) => c.id);
      const linkedEvidence = p.evidences.filter((ev) => ev.skillIds.includes(sid));
      const ownUncompleted = ownCourses.filter((c) => c.teaches.includes(sid) && !completed.has(c.id));
      const crossUncompleted = teaching.filter((c) => c.major !== p.major && !completed.has(c.id));
      skills.push({ skillId: sid, skillName: skillName(sid), status: st, maxWeight: req.maxWeight,
        requiredByReqIds: req.reqIds, subTags: [...req.subTags],
        teachingCourseIds: teaching.map((c) => c.id), completedCourseIds: completedHere,
        evidenceIds: linkedEvidence.map((ev) => ev.id),
        evidenceVerified: linkedEvidence.some(hasVerifiedEvidence),
        recommendedCourseIds: st === 'UNLEARNED' ? [...ownUncompleted.map((c) => c.id), ...crossUncompleted.map((c) => c.id)] : [],
        upgradeCourseIds: st === 'LEARNED_UNVERIFIED' ? completedHere : [],
        recommendation: recommend(st, skillName(sid), ownUncompleted, crossUncompleted, completedHere, linkedEvidence, completed) });
    }
    const order = { UNLEARNED: 0, LEARNED_UNVERIFIED: 1, VERIFIED: 2 };
    skills.sort((a, b) => order[a.status] - order[b.status] || b.maxWeight - a.maxWeight);
    return { targetReqIds, skills, unrecognized };
  }

  /* ---- Kahn 拓扑排序（已修视为满足先修） ---- */
  const SEMESTER_INDEX = { '大一上': 1, '大一下': 2, '大二上': 3, '大二下': 4, '大三上': 5, '大三下': 6, '大四上': 7, '大四下': 8 };
  const semesterOf = (id) => SEMESTER_INDEX[(COURSE_BY_ID.get(id) || {}).semester] || 99;
  function topoSortCourses(major, completedIds) {
    const courses = coursesOfMajor(major);
    const completed = new Set(completedIds);
    const inDegree = new Map(), dependents = new Map();
    for (const c of courses) {
      const unmet = c.prereq.filter((x) => !completed.has(x) && COURSE_BY_ID.has(x));
      inDegree.set(c.id, unmet.length);
      for (const x of unmet) { const l = dependents.get(x) || []; l.push(c.id); dependents.set(x, l); }
    }
    const queue = courses.filter((c) => !completed.has(c.id) && (inDegree.get(c.id) || 0) === 0)
      .sort((a, b) => semesterOf(a.id) - semesterOf(b.id) || a.id.localeCompare(b.id)).map((c) => c.id);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const dep of dependents.get(id) || []) {
        const next = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, next);
        if (next === 0) { queue.push(dep); queue.sort((a, b) => semesterOf(a) - semesterOf(b) || a.localeCompare(b)); }
      }
    }
    const remaining = courses.filter((c) => !completed.has(c.id)).map((c) => c.id);
    const readyNow = courses.filter((c) => !completed.has(c.id) && c.prereq.every((x) => completed.has(x))).map((c) => c.id);
    return { order, completed: courses.filter((c) => completed.has(c.id)).map((c) => c.id), remaining, readyNow, blocked: remaining.filter((id) => !readyNow.includes(id)) };
  }

  /* ---- 作业升级（工时来自精标模板，周数确定性推出） ---- */
  function titleAffinity(text, title) {
    for (let i = 0; i + 4 <= title.length; i++) if (text.includes(title.slice(i, i + 4))) return 3;
    return 0;
  }
  function matchCourseByText(p, text) {
    if (!text.trim()) return null;
    const found = extractSkillsFromText(text);
    const courses = coursesOfMajor(p.major);
    if (!found.length) { const c = courses.find((c) => text.includes(c.name) || text.includes(c.assignment.title)); return c ? c.id : null; }
    const wanted = new Set(found.map((f) => f.skillId));
    let best = null;
    for (const c of courses) {
      const descSkills = new Set(extractSkillsFromText(c.assignment.description).map((s) => s.skillId));
      const score = c.teaches.filter((s) => wanted.has(s)).length + titleAffinity(text, c.assignment.title) +
        [...wanted].filter((s) => descSkills.has(s)).length + (text.includes(c.name) ? 2 : 0);
      if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
    }
    return best ? best.id : null;
  }
  function buildUpgradePlan(p, courseId, sourceText, gaps) {
    const resolvedId = courseId || matchCourseByText(p, sourceText);
    if (!resolvedId) return null;
    const course = COURSE_BY_ID.get(resolvedId);
    if (!course) return null;
    const gapSkills = new Set(gaps.filter((g) => g.status !== 'evidenced').map((g) => g.skillId));
    const tasks = [...course.assignment.upgradeTasks].sort((a, b) =>
      (gapSkills.has(a.skillId) ? 0 : 1) - (gapSkills.has(b.skillId) ? 0 : 1) || b.estimatedHours - a.estimatedHours);
    const totalHours = tasks.reduce((s, t) => s + t.estimatedHours, 0);
    const weeklyHours = Math.max(p.weeklyHours, 1);
    const weeksNeeded = Math.ceil(totalHours / weeklyHours);
    return { id: 'plan_' + course.id, courseId: course.id, assignmentTitle: course.assignment.title, sourceText, tasks,
      totalHours, weeklyHours, weeksNeeded, fitsBudget: weeksNeeded <= 8, mode: 'deterministic',
      evidenceOutputs: tasks.map((t) => ({ evidenceId: 'ev_plan_' + course.id + '_' + t.id, title: t.deliverable, skillIds: [t.skillId], verified: false })) };
  }

  /* ---- 有据简历：每条绑定 evidenceId，未核验量化一律占位符 ---- */
  function buildGroundedBullets(p, targetReqId) {
    const reqSkills = new Set(((REQ_BY_ID.get(targetReqId || '') || {}).skills || []).map((s) => s.skillId));
    const bullets = p.evidences.filter(ev => verificationOf(ev) !== 'rejected').map((ev) => {
      const placeholders = [];
      const clauses = (ev.metrics || []).map((m) => {
        if (m.verified && m.value != null) return m.label + ' ' + m.value;
        const phrase = m.label + ' ' + PLACEHOLDER;
        placeholders.push(phrase);
        return phrase;
      });
      const text = ev.title + '：' + ev.description + (clauses.length ? ' ' + clauses.join('；') + '。' : '');
      const fullyVerified = hasVerifiedEvidence(ev) && (ev.metrics || []).every((m) => m.verified && m.value != null);
      return { id: 'bullet_' + ev.id, text, evidenceId: ev.id, courseId: ev.courseId, verified: fullyVerified, placeholders, targetReqId };
    });
    if (!reqSkills.size) return bullets;
    const relevance = (b) => { const ev = p.evidences.find((e) => e.id === b.evidenceId); return (ev ? ev.skillIds : []).filter((s) => reqSkills.has(s)).length; };
    return bullets.sort((a, b) => relevance(b) - relevance(a));
  }

  /* ---- 粘贴 JD 确定性解析 ---- */
  const DELIVERABLE_RULES = [
    { re: /github|repo|开源|代码仓库|gitlab/i, label: '可运行代码仓库（GitHub Repo + README）' },
    { re: /测试报告|单元测试|集成测试|压测/, label: '测试报告（用例 + 覆盖率）' },
    { re: /看板|可视化|dashboard|报表/i, label: '数据分析看板' },
    { re: /作品集|作品|demo|演示/i, label: '作品集 / 可演示 Demo' },
    { re: /研究报告|分析报告|调研报告|报告/, label: '分析 / 研究报告' },
    { re: /访谈|调研|问卷|用户研究/, label: '真实访谈 / 调研记录' },
    { re: /论文|发表|期刊|会议/, label: '论文 / 发表记录' },
    { re: /专利/, label: '专利' },
    { re: /竞赛|获奖|奖项|大赛/, label: '竞赛获奖证明' },
    { re: /实习证明|实习经历|实习/, label: '实习证明' },
    { re: /证书|资格证|持证/, label: '资格证书' },
  ];
  const TITLE_HINT = /工程师|经理|专员|岗位|实习|研究|分析|运营|开发|教师|公务员|选调|设计师|算法|产品|财务|审计|咨询|编辑|策划/;
  function extractJobTitle(text) {
    const labeled = text.match(/(?:岗位名称|岗位|职位|招聘岗位)\s*[:：]\s*([^\n，,。;；]{2,40})/);
    if (labeled) return labeled[1].trim();
    const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    if (firstLine && TITLE_HINT.test(firstLine) && firstLine.length <= 40) return firstLine;
    const hinted = text.match(/([^\n，,。;；]{0,16}(?:工程师|经理|专员|实习生|研究员|分析师|运营|开发|教师|设计师))[^\n，,。;；]{0,8}/);
    if (hinted) return hinted[1].trim().slice(0, 40);
    return '自定义岗位（粘贴 JD）';
  }
  function extractGates(text) {
    const gates = [], seen = new Set();
    const push = (type, label, raw) => { const k = type + '|' + label; if (seen.has(k)) return; seen.add(k); gates.push({ type, label, raw: raw.trim().slice(0, 80) }); };
    for (const m of text.matchAll(/(202[4-9])\s*届/g)) push('graduation', m[1] + '届', m[0]);
    for (const m of text.matchAll(/(?:^|[^\d])(2[5-9])\s*届/g)) push('graduation', '20' + m[1] + '届', m[0]);
    for (const m of text.matchAll(/(?:学历|要求|具备)?\s*(本科|硕士|研究生|大专|博士)(?:及以上|以上|学历)?/g)) push('degree', m[1], m[0]);
    for (const m of text.matchAll(/(?:均分|绩点|GPA)\s*(?:≥|>=|不低于|要求|达到)?\s*(\d{2,3})/gi)) push('gpa', '均分≥' + m[1], m[0]);
    for (const m of text.matchAll(/前\s*(\d{1,2})\s*%/g)) push('rank', '排名前' + m[1] + '%', m[0]);
    for (const m of text.matchAll(/(英语四级|CET-?4|CET-?6|英语六级|雅思\s*\d?\.?\d?|托福\s*\d{2,3}|专四|专八)/gi)) push('english', m[1], m[0]);
    for (const m of text.matchAll(/(中共党员|党员|学生干部|应届|往届|实习经历|工作经验)/g)) push('other', m[1], m[0]);
    return gates;
  }
  function extractHardGateObject(text, existing = {}) {
    const raw = String(text || '');
    const gate = {
      graduationYears: [...(existing.graduationYears || [])],
      minDegree: existing.minDegree ?? null,
      minGpaPercent: existing.minGpaPercent ?? null,
      maxRankPercent: existing.maxRankPercent ?? null,
      englishRequirement: existing.englishRequirement ?? null,
      otherGates: [...(existing.otherGates || [])],
    };
    if (!gate.graduationYears.length) {
      const years = new Set();
      for (const m of raw.matchAll(/(202[5-9])\s*(?:届|毕业生|应届)/g)) years.add(Number(m[1]));
      for (const m of raw.matchAll(/(?:^|[^\d])(2[5-9])\s*届/g)) years.add(Number('20' + m[1]));
      for (const m of raw.matchAll(/毕业时间[^。\n；;]{0,16}(202[5-9])/g)) years.add(Number(m[1]));
      if (years.size) gate.graduationYears = [...years].sort((a, b) => a - b);
    }
    if (!gate.minDegree) {
      const degMap = { '大专': 'associate', '专科': 'associate', '本科': 'bachelor', '大学本科': 'bachelor', '学士': 'bachelor', '硕士': 'master', '研究生': 'master', '博士': 'phd' };
      const rank = { associate: 1, bachelor: 2, master: 3, phd: 4 };
      const clauses = raw.split(/[\r\n。；;]+/).filter(line => !/优先|加分|更佳/.test(line) || /本科及以上|大专及以上/.test(line));
      let minRank = Infinity, picked = null;
      for (const line of clauses) {
        for (const m of line.matchAll(/(大专|专科|大学本科|本科|硕士|研究生|博士)(?:及以上|以上|或以上)?(?:学历)?/g)) {
          const id = degMap[m[1]];
          if (id && rank[id] < minRank) { minRank = rank[id]; picked = id; }
        }
      }
      if (picked) gate.minDegree = picked;
    }
    if (!gate.englishRequirement) {
      const eng = raw.match(/(CET-?[46]|英语[四六]级|雅思\s*\d(?:\.\d)?|托福\s*\d{2,3}|英语流利|英文读写流利)/i);
      if (eng) gate.englishRequirement = eng[1].trim();
    }
    return gate;
  }
  function extractDeliverables(text) {
    const out = [];
    for (const r of DELIVERABLE_RULES) if (r.re.test(text) && !out.includes(r.label)) out.push(r.label);
    return out.length ? out : ['可核验的项目交付物（README + 成果文件）'];
  }
  function parseJdCore(p, text) {
    const lower = text.toLowerCase();
    const normalized = extractSkillsFromText(text);
    const bySkill = new Map();
    for (const n of normalized) {
      const freq = countOccurrences(lower, n.matchedAlias);
      const weight = round2(clamp(0.4 + 0.15 * Math.max(0, freq - 1), 0.4, 1));
      const e = bySkill.get(n.skillId) || { weight: 0, subTags: new Set() };
      e.weight = Math.max(e.weight, weight);
      if (n.subTag) e.subTags.add(n.subTag);
      bySkill.set(n.skillId, e);
    }
    const skills = [...bySkill.entries()].map(([sid, e]) => ({ skillId: sid, skillName: skillName(sid), subTags: [...e.subTags], weight: e.weight, status: reverseStatusOf(p, sid) }))
      .sort((a, b) => b.weight - a.weight);
    const analysis = analyzeTargets(p, { jdText: text });
    const verifiedCount = analysis.skills.filter((s) => s.status === 'VERIFIED').length;
    const unverifiedCount = analysis.skills.filter((s) => s.status === 'LEARNED_UNVERIFIED').length;
    const unlearnedCount = analysis.skills.filter((s) => s.status === 'UNLEARNED').length;
    const topGaps = analysis.skills.filter((s) => s.status !== 'VERIFIED').slice(0, 3).map((s) => s.skillName + '（' + STATUS_LABEL[s.status] + '）');
    const jobTitle = extractJobTitle(text);
    return { jobTitle, hardGates: extractGates(text), skills, deliverables: extractDeliverables(text),
      analysis, verifiedCount, unverifiedCount, unlearnedCount, topGaps,
      coverageNote: 'JD 归一化出 ' + skills.length + ' 项技能：' + verifiedCount + ' 项已有证据 / ' + unverifiedCount + ' 项学过待验证 / ' + unlearnedCount + ' 项尚未学习。',
      summary: jobTitle + '：匹配 ' + skills.length + ' 项技能，' + verifiedCount + ' 项已有证据，优先补齐 ' + (topGaps[0] || '关键缺口') + '。',
      unrecognized: analysis.unrecognized };
  }

  /* ---- 竞赛需求种子（A 级官网，能力要求为精标基准模型） ---- */
  const V = '2026-11-18';
  const cite = (sourceName, sourceUrl, tier) => ({ sourceName, sourceUrl, publishDate: V, verifiedDate: V, trustTier: tier || 'A_OFFICIAL' });
  const COMPETITIONS = [
    { id: 'comp_lanqiao', kind: 'competition', title: '蓝桥杯（软件类 / Python / Java / C++）', org: '工业和信息化部人才交流中心', category: '程序设计竞赛',
      majors: ['cs', 'mat_mech'], paths: ['job', 'baoyan'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['个人赛，按省赛 / 国赛分级'] },
      skills: [{ skillId: 'programming_basics', weight: 0.3 }, { skillId: 'data_structures', weight: 0.3 }, { skillId: 'algorithms', weight: 0.3 }, { skillId: 'python', weight: 0.1 }],
      bonusEvidenceTypes: ['省赛 / 国赛获奖证书', '在线判题通过记录'], isBenchmarkModel: true, snapshotDate: V, citation: cite('蓝桥杯大赛官网', 'https://dasai.lanqiao.cn') },
    { id: 'comp_acm', kind: 'competition', title: 'ACM-ICPC / CCPC 程序设计竞赛', org: 'ICPC 基金会 / 中国计算机学会', category: '程序设计竞赛',
      majors: ['cs'], paths: ['job', 'baoyan'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['3 人组队，校内选拔'] },
      skills: [{ skillId: 'algorithms', weight: 0.4 }, { skillId: 'data_structures', weight: 0.35 }, { skillId: 'programming_basics', weight: 0.15 }, { skillId: 'teamwork_comm', weight: 0.1 }],
      bonusEvidenceTypes: ['区域赛奖牌', 'Codeforces / 洛谷 rating 与题解'], isBenchmarkModel: true, snapshotDate: V, citation: cite('ICPC 官方 / 洛谷', 'https://icpc.global') },
    { id: 'comp_mcm', kind: 'competition', title: '全国大学生数学建模竞赛（国赛）/ MCM', org: '中国工业与应用数学学会 / COMAP', category: '数学建模',
      majors: ['cs', 'econ', 'mat_mech'], paths: ['job', 'baoyan', 'abroad'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['3 人组队，9 月国赛 / 2 月美赛'] },
      skills: [{ skillId: 'statistics', weight: 0.25 }, { skillId: 'data_analysis', weight: 0.25 }, { skillId: 'python', weight: 0.2 }, { skillId: 'research_writing', weight: 0.15 }, { skillId: 'teamwork_comm', weight: 0.15 }],
      bonusEvidenceTypes: ['获奖论文', '可复现代码与数据'], isBenchmarkModel: true, snapshotDate: V, citation: cite('全国大学生数学建模竞赛官网', 'https://www.mcm.edu.cn') },
    { id: 'comp_hulianwang', kind: 'competition', title: '中国国际大学生创新大赛（互联网+）', org: '教育部', category: '创新创业',
      majors: ['cs', 'econ', 'chinese', 'mat_mech'], paths: ['job', 'baoyan'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['团队项目，需商业计划书 / 路演'] },
      skills: [{ skillId: 'project_mgmt', weight: 0.25 }, { skillId: 'market_research', weight: 0.2 }, { skillId: 'logic_expression', weight: 0.2 }, { skillId: 'teamwork_comm', weight: 0.2 }, { skillId: 'business_analysis', weight: 0.15 }],
      bonusEvidenceTypes: ['商业计划书', '路演视频 / 获奖证明'], isBenchmarkModel: true, snapshotDate: V, citation: cite('全国大学生创业服务网', 'https://cy.ncss.cn') },
    { id: 'comp_tiaozhanbei', kind: 'competition', title: '挑战杯（课外学术科技 / 创业计划）', org: '共青团中央 / 中国科协', category: '学术科技',
      majors: ['cs', 'econ', 'chinese', 'mat_mech'], paths: ['baoyan', 'job'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['作品申报，校赛 / 省赛 / 国赛'] },
      skills: [{ skillId: 'research_writing', weight: 0.3 }, { skillId: 'data_analysis', weight: 0.2 }, { skillId: 'logic_expression', weight: 0.2 }, { skillId: 'project_mgmt', weight: 0.15 }, { skillId: 'teamwork_comm', weight: 0.15 }],
      bonusEvidenceTypes: ['学术作品 / 调查报告', '获奖证明'], isBenchmarkModel: true, snapshotDate: V, citation: cite('挑战杯官网', 'https://www.tiaozhanbei.net') },
    { id: 'comp_softcup', kind: 'competition', title: '中国软件杯大学生软件设计大赛', org: '工业和信息化部 / 教育部', category: '软件设计',
      majors: ['cs'], paths: ['job', 'baoyan'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['团队作品，企业命题'] },
      skills: [{ skillId: 'spring_boot', weight: 0.25 }, { skillId: 'web_frontend', weight: 0.2 }, { skillId: 'sql_rdbms', weight: 0.2 }, { skillId: 'api_design', weight: 0.15 }, { skillId: 'git_collab', weight: 0.1 }, { skillId: 'teamwork_comm', weight: 0.1 }],
      bonusEvidenceTypes: ['可运行作品 + 源码', '获奖证书'], isBenchmarkModel: true, snapshotDate: V, citation: cite('中国软件杯官网', 'https://www.cnsoftbei.com') },
    { id: 'comp_daguangsai', kind: 'competition', title: '全国大学生广告艺术大赛（大广赛）', org: '中国高等教育学会', category: '文科·创意传播',
      majors: ['chinese', 'econ'], paths: ['job', 'baoyan'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['命题创作，平面 / 视频 / 文案 / 策划'] },
      skills: [{ skillId: 'copywriting', weight: 0.3 }, { skillId: 'new_media_ops', weight: 0.25 }, { skillId: 'video_editing', weight: 0.2 }, { skillId: 'content_ops', weight: 0.15 }, { skillId: 'logic_expression', weight: 0.1 }],
      bonusEvidenceTypes: ['参赛作品链接', '获奖证明'], isBenchmarkModel: true, snapshotDate: V, citation: cite('大广赛官网', 'https://www.sun-ada.net') },
    { id: 'comp_jingdian', kind: 'competition', title: '中华经典诵写讲大赛', org: '教育部 / 国家语委', category: '文科·语言文化',
      majors: ['chinese'], paths: ['job', 'baoyan', 'civil_service'], hardGate: { graduationYears: [], minDegree: null, minGpaPercent: null, maxRankPercent: null, englishRequirement: null, otherGates: ['诵读 / 书写 / 讲解 / 篆刻'] },
      skills: [{ skillId: 'language_norm', weight: 0.3 }, { skillId: 'logic_expression', weight: 0.3 }, { skillId: 'official_writing', weight: 0.2 }, { skillId: 'teaching_design', weight: 0.2 }],
      bonusEvidenceTypes: ['参赛视频 / 作品', '获奖证明'], isBenchmarkModel: true, snapshotDate: V, citation: cite('中华经典诵写讲大赛官网', 'https://jingdian.ysyz.edu.cn') },
  ];
  /* ---- 来源注册表（A 官网公开接口定时刷新；遵守 robots·限速≥2000ms·条件 GET） ---- */
  const SOURCES = [
    { id: 'src_tencent', sourceName: '腾讯招聘（2027 届校招）', sourceUrl: 'https://join.qq.com', publishDate: V, verifiedDate: V, trustTier: 'A_OFFICIAL', category: '互联网/AI', fetch: { mode: 'json_api', endpoint: 'https://join.qq.com/api/v1/position/searchPosition', minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot' },
    { id: 'src_bytedance', sourceName: '字节跳动招聘', sourceUrl: 'https://jobs.bytedance.com', publishDate: V, verifiedDate: V, trustTier: 'A_OFFICIAL', category: '互联网/AI', fetch: { mode: 'json_api', endpoint: 'https://jobs.bytedance.com/api/v1/search/job/posts', minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot' },
    { id: 'src_alibaba', sourceName: '阿里巴巴集团招聘', sourceUrl: 'https://talent.alibaba.com', publishDate: V, verifiedDate: V, trustTier: 'A_OFFICIAL', category: '互联网/AI', fetch: { mode: 'html', endpoint: 'https://talent.alibaba.com/off-campus', minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot' },
    { id: 'src_huawei', sourceName: '华为招聘', sourceUrl: 'https://career.huawei.com', publishDate: V, verifiedDate: V, trustTier: 'A_OFFICIAL', category: '智能硬件/制造', fetch: { mode: 'json_api', endpoint: 'https://career.huawei.com/reccampportal/services/portal/portalpub/getJobList', minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot' },
    { id: 'src_ncss', sourceName: '教育部 24365 国家大学生就业服务平台', sourceUrl: 'https://www.ncss.cn', publishDate: V, verifiedDate: V, trustTier: 'A_OFFICIAL', category: '综合平台', fetch: { mode: 'html', endpoint: 'https://www.ncss.cn', minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot' },
    { id: 'src_jobradar', sourceName: 'JobRadar 合规招聘快照（开源聚合）', sourceUrl: 'https://github.com/lijiaqi-AI-Product-Manager/job_radar', publishDate: V, verifiedDate: V, trustTier: 'B_EXPERIENCE', category: '综合平台', fetch: { mode: 'sqlite_snapshot', endpoint: 'https://github.com/lijiaqi-AI-Product-Manager/job_radar/releases/tag/data-latest', minIntervalMs: 0 }, hash: null, lastStatus: 'frozen_snapshot', note: 'MIT 开源合规聚合：只访问公开可读内容，不绕过登录/验证码/风控；保留岗位原始链接与发布时间。官网/ATS 渠道岗位标 A 级、高校就业网聚合标 B 级；薪资/福利/实习周期仅取 JD 明示，未写留空，绝不臆造。' },
  ];

  /* ---- 大厂官网入口种子：聚合自用户提供的《27届校招秋招实习内推合集》（腾讯文档，guest 可读，2026-11-19 提取）。
   * 众包内推合集本身为 B 级聚合来源；下列各公司官方招聘入口为 A 级。已去除内推码 / 分享参数，仅保留官方入口。
   * 这些是「来源/入口」而非具体岗位 JD——不臆造技能与门槛；具体岗位 JD 由官网公开接口真实抓取（A 级），入口供溯源与生产刷新。 ---- */
  const DOC_V = '2026-11-19';
  const DOC_NOTE = '官网招聘入口·滚动更新；聚合自用户提供的 27 届校招内推合集（腾讯文档），已去除内推 / 分享参数。';
  const SOURCE_PROVENANCE = { name: '27届校招秋招实习内推合集（欢迎大家分享！）', url: 'https://docs.qq.com/smartsheet/DY3pHYkNvb0ZRSHdi?tab=BB08J2', trustTier: 'B_EXPERIENCE', accessedDate: DOC_V, note: '众包内推合集（含个人内推码），作为官网入口聚合来源；具体岗位以各公司官网为准，不臆造技能 / 门槛 / 日期。' };
  const portal = (id, sourceName, sourceUrl, category) => ({ id, sourceName, sourceUrl, publishDate: DOC_V, verifiedDate: DOC_V, trustTier: 'A_OFFICIAL', category, fetch: { mode: 'html', endpoint: sourceUrl, minIntervalMs: 2000 }, hash: null, lastStatus: 'frozen_snapshot', note: DOC_NOTE });
  const PORTALS = [
    portal('src_meituan', '美团招聘', 'https://zhaopin.meituan.com', '互联网/AI'),
    portal('src_jd', '京东校招', 'https://campus.jd.com', '互联网/AI'),
    portal('src_netease', '网易互联网校招', 'https://campus.163.com', '互联网/AI'),
    portal('src_kuaishou', '快手校招', 'https://campus.kuaishou.cn', '互联网/AI'),
    portal('src_bilibili', '哔哩哔哩招聘', 'https://jobs.bilibili.com', '互联网/AI'),
    portal('src_xiaohongshu', '小红书招聘', 'https://job.xiaohongshu.com', '互联网/AI'),
    portal('src_antgroup', '蚂蚁集团招聘', 'https://hrrecommend.antgroup.com', '互联网/AI'),
    portal('src_didi', '滴滴招聘', 'https://app.mokahr.com/campus_apply/didiglobal/96064', '互联网/AI'),
    portal('src_iflytek', '科大讯飞招聘', 'https://iflytek.zhiye.com', '互联网/AI'),
    portal('src_pdd', '拼多多招聘', 'https://careers.pddglobalhr.com', '互联网/AI'),
    portal('src_tme', '腾讯音乐招聘', 'https://join.tencentmusic.com', '互联网/AI'),
    portal('src_ctrip', '携程招聘', 'https://careers.ctrip.com', '互联网/AI'),
    portal('src_lenovo', '联想校招', 'https://talent.lenovo.com.cn', '互联网/AI'),
    portal('src_10jqka', '同花顺校招', 'https://campus.10jqka.com.cn', '互联网/AI'),
    portal('src_eastmoney', '东方财富招聘', 'https://app.mokahr.com/campus_apply/eastmoney/92400', '互联网/AI'),
    portal('src_wind', '万得 Wind 招聘', 'https://www.wind.com.cn', '互联网/AI'),
    portal('src_360', '360 校招', 'https://360campus.zhiye.com', '互联网/AI'),
    portal('src_wps', '金山办公 WPS 招聘', 'https://app.mokahr.com/campus-recruitment/wps/41436', '互联网/AI'),
    portal('src_poizon', '得物招聘', 'https://poizon.jobs.feishu.cn', '互联网/AI'),
    portal('src_jtexpress', '极兔速递招聘', 'https://jtexpress.jobs.feishu.cn', '互联网/AI'),
    portal('src_zuoyebang', '作业帮招聘', 'https://app.mokahr.com/campus_apply/zuoyebang/39595', '互联网/AI'),
    portal('src_huolala', '货拉拉招聘', 'https://app.mokahr.com/campus-recruitment/huolalahr/98660', '互联网/AI'),
    portal('src_glodon', '广联达招聘', 'https://app.mokahr.com/campus-recruitment/glodon/91966', '互联网/AI'),
    portal('src_intsig', '合合信息招聘', 'https://intsig.zhiye.com', '互联网/AI'),
    portal('src_wondershare', '万兴科技招聘', 'https://wondersharecampus.zhiye.com', '互联网/AI'),
    portal('src_yealink', '亿联网络招聘', 'https://yealink.zhiye.com', '互联网/AI'),
    portal('src_iwhalecloud', '浩鲸科技招聘', 'https://iwhalecloud1.zhiye.com', '互联网/AI'),
    portal('src_qunhe', '群核科技（酷家乐）招聘', 'https://app.mokahr.com/campus_apply/qunhemail/2832', '互联网/AI'),
    portal('src_oppo', 'OPPO 校招', 'https://careers.oppo.com', '智能硬件/制造'),
    portal('src_vivo', 'vivo 校招', 'https://hr-campus.vivo.com', '智能硬件/制造'),
    portal('src_tplink', 'TP-Link 普联招聘', 'https://join.tplinkglobal.com', '智能硬件/制造'),
    portal('src_haier', '海尔招聘', 'https://maker.haier.net', '智能硬件/制造'),
    portal('src_cvte', 'CVTE 视源股份招聘', 'https://campus.cvte.com', '智能硬件/制造'),
    portal('src_anker', '安克创新招聘', 'https://anker-in.jobs.feishu.cn', '智能硬件/制造'),
    portal('src_bosch', '博世招聘', 'https://app.mokahr.com/campus_apply/bosch/151492', '智能硬件/制造'),
    portal('src_shein', 'SHEIN 招聘', 'https://app.mokahr.com/campus_apply/shein/2932', '智能硬件/制造'),
    portal('src_cambricon', '寒武纪招聘', 'https://app.mokahr.com/m/recommendation-apply/cambricon/46261', '智能硬件/制造'),
    portal('src_deeproute', '元戎启行招聘', 'https://app.mokahr.com/social-recruitment/deeproute/143885', '智能硬件/制造'),
    portal('src_leihuo', '网易雷火招聘', 'https://xiaozhao.leihuo.netease.com', '游戏/创意'),
    portal('src_kuro', '库洛游戏招聘', 'https://kurogame.jobs.feishu.cn', '游戏/创意'),
    portal('src_lingxi', '灵犀互娱招聘', 'https://go.lingxigames.com', '游戏/创意'),
    portal('src_sgcc', '国家电网招聘', 'https://zhaopin.sgcc.com.cn', '国企/央企/金融'),
    portal('src_cmcc', '中国移动招聘', 'https://job.10086.cn', '国企/央企/金融'),
    portal('src_chinatelecom', '中国电信招聘', 'http://www.chinatelecom.com.cn/zp/', '国企/央企/金融'),
    portal('src_icbc', '中国工商银行招聘', 'https://job.icbc.com.cn', '国企/央企/金融'),
    portal('src_cmb', '招商银行招聘', 'https://career.cmbchina.com', '国企/央企/金融'),
    portal('src_bankcomm', '交通银行招聘', 'https://job.bankcomm.com', '国企/央企/金融'),
    portal('src_crrc', '中国中车招聘', 'https://www.crrcgc.cc', '国企/央企/金融'),
    portal('src_comac', '中国商飞招聘', 'https://zhaopin.comac.cc', '国企/央企/金融'),
    portal('src_ceair', '东方航空招聘', 'https://job.ceair.com', '国企/央企/金融'),
    portal('src_csair', '南方航空招聘', 'https://job.csair.cn', '国企/央企/金融'),
    portal('src_chnenergy', '国家能源集团招聘', 'https://zhaopin.chnenergy.com.cn', '国企/央企/金融'),
    portal('src_cnnc', '中核集团招聘', 'https://cnnc.zhiye.com', '国企/央企/金融'),
    portal('src_casc', '航天科技招聘', 'https://www.casc.com.cn', '国企/央企/金融'),
    portal('src_casic', '航天科工招聘', 'http://www.casic.com.cn', '国企/央企/金融'),
    portal('src_cec', '中国电子招聘', 'https://cec.hotjob.cn', '国企/央企/金融'),
    portal('src_cetc', '中国电科招聘', 'http://www.cetc.com.cn', '国企/央企/金融'),
    portal('src_ctg', '三峡集团招聘', 'https://www.ctg.cn', '国企/央企/金融'),
    portal('src_cosco', '中远海运招聘', 'https://www.coscoshipping.com', '国企/央企/金融'),
    portal('src_baowu', '中国宝武招聘', 'https://campus.51job.com/baowugroup2024/', '国企/央企/金融'),
    portal('src_cnbm', '中国建材招聘', 'https://www.cnbm.com.cn', '国企/央企/金融'),
    portal('src_chinalco', '中铝集团招聘', 'https://www.chinalco.com.cn', '国企/央企/金融'),
    portal('src_chinarailway', '中国国家铁路招聘', 'https://rczp.china-railway.com.cn', '国企/央企/金融'),
    portal('src_crecg', '中国中铁招聘', 'http://www.crecg.com', '国企/央企/金融'),
    portal('src_sinochem', '中国中化招聘', 'https://sinochem.hotjob.cn', '国企/央企/金融'),
    portal('src_cdt', '中国大唐招聘', 'https://zhaopin.china-cdt.com', '国企/央企/金融'),
    portal('src_powerchina', '中国电建招聘', 'https://zhaopin.powerchina.cn', '国企/央企/金融'),
    portal('src_ubiquant', '九坤投资招聘', 'https://app.mokahr.com/campus-recruitment/ubiquantrecruit/37031', '国企/央企/金融'),
    portal('src_iguopin', '国聘（央企招聘平台）', 'https://job.iguopin.com', '综合平台'),
    portal('src_chsi', '学信网就业招聘', 'https://jybzp.chsi.com.cn', '综合平台'),
    portal('src_51job', '前程无忧', 'https://www.51job.com', '综合平台'),
    portal('src_mohrss', '人社部公共就业服务', 'http://job.mohrss.gov.cn', '综合平台'),
  ];
  PORTALS.forEach((p) => SOURCES.push(p));

  /* ---- 统一需求库（岗位 + 竞赛 + 用户粘贴） ---- */
  const REQ_BY_ID = new Map();
  D.jobs.forEach((j) => REQ_BY_ID.set(j.id, Object.assign({ kind: 'job' }, j)));
  COMPETITIONS.forEach((c) => REQ_BY_ID.set(c.id, c));
  function allRequirements() { return [...REQ_BY_ID.values()]; }
  function setImportedJobs(jobs) {
    for (const [id, req] of REQ_BY_ID) if (req.userImported) REQ_BY_ID.delete(id);
    for (const job of jobs) if (job.userImported && !REQ_BY_ID.has(job.id)) REQ_BY_ID.set(job.id, job);
  }

  /* ---- 自进化：djb2 hash 比对（MVP 离线快照核验；生产由官网接口定时刷新） ---- */
  function djb2(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h; }
  function snapshotHash(reqs) { return (djb2(JSON.stringify(reqs)) >>> 0).toString(36); }
  function checkUpdate(prevHash) {
    const reqs = allRequirements().filter(req => !req.userImported);
    const hash = snapshotHash(reqs);
    const changed = prevHash != null && prevHash !== hash;
    return { hash, changed, verifiedDate: fmtToday(), count: reqs.length,
      note: changed ? '本地数据快照已变更。各岗位仍显示原有观测时间。' : '本地快照未变更。岗位状态和来源观测时间见各岗位详情。' };
  }
  function fmtToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---- 路径感知优先级（确定性乘子） ---- */
  function pathPriority(path, gap) {
    const w = gap.maxWeight;
    if (path === 'baoyan') return round2(w * 1.3 + (gap.status === 'evidenced' ? 0.7 : 0));
    return round2(w * 1.0 + (gap.status === 'evidenced' ? 1.2 : 0));
  }

  /* ---- 桥接：原型 profile（中文课程名 / achievements）→ CC profile ---- */
  const MAJOR_KW = {
    cs: ['计算机', '软件', '数据科学', '人工智能', '网络工程', '信息安全', '物联网', '编程', '数学', '统计'],
    econ: ['营销', '工商', '管理', '经济', '金融', '会计', '市场', '商务', '经管', '财务', '审计'],
    mat_mech: ['材料', '化学', '化工', '高分子', '机械', '物理', '力学', '工程', '制造'],
    chinese: ['汉语', '中文', '文学', '汉语言', '师范', '教育', '新闻', '传播', '外语', '英语', '翻译', '历史', '哲学'],
  };
  function majorOf(majorStr) {
    const m = String(majorStr || '').toLowerCase();
    if (/机电|自动化|机器人工程|电气工程|电子信息/.test(m)) return 'mat_mech';
    for (const key of ['cs', 'econ', 'mat_mech', 'chinese']) if (MAJOR_KW[key].some((k) => m.includes(k))) return key;
    return null;
  }
  function resolveCourseId(name, major) {
    const n = String(name || '').replace(/[《》（）()\s]/g, '').trim();
    if (!n) return null;
    const pool = coursesOfMajor(major);
    let hit = pool.find((c) => c.name === n) || pool.find((c) => n.includes(c.name) || c.name.includes(n));
    if (hit) return hit.id;
    hit = D.courses.find((c) => c.name === n) || D.courses.find((c) => n.includes(c.name) || c.name.includes(n));
    return hit ? hit.id : null;
  }
  const PATH_MAP = { baoyan: 'baoyan', kaoyan: 'kaoyan', liuxue: 'abroad', jiuye: 'job' };
  function gradYearFromGrade(grade) {
    const g = { '大一': 1, '大二': 2, '大三': 3, '大四': 4 }[String(grade || '大三').slice(0, 2)] || 3;
    return 2028 + (3 - g);
  }
  function ccProfileFromState(st) {
    const p = st.profile;
    const major = majorOf(p.major);
    const courseRecords = (p.courses || []).map(c => ({ ...c, id: c.id || resolveCourseId(c.name, major) }));
    const listed = new Set(courseRecords.map(course => course.id));
    const isCompletedStatus = status => ['已通过', '已修', 'completed'].includes(status);
    const completedCourseIds = [...new Set([
      ...(p.completedCourseIds || []).filter(id => !listed.has(id)),
      ...courseRecords.filter(course => isCompletedStatus(course.status)).map(course => course.id),
    ].filter(Boolean))];
    const inProgress = courseRecords.filter(course => ['在修', 'in_progress'].includes(course.status));
    const completedCourseSkillIds = [...new Set(courseRecords.filter(course => isCompletedStatus(course.status))
      .flatMap(course => extractSkillsFromText(course.name).map(skill => skill.skillId)))];
    const inProgressCourseSkillIds = [...new Set(inProgress.flatMap(course => extractSkillsFromText(course.name).map(skill => skill.skillId)))];
    const evidences = (p.evidences || []).map(ev => ({ ...ev, type: canonicalEvidenceType(ev) }));
    for (const [index, achievement] of (p.achievements || []).entries()) {
      if (evidences.some(e => e.id === achievement.id || (!achievement.id && e.title === achievement.title))) continue;
      const materials = Array.isArray(achievement.materials) ? achievement.materials.filter(Boolean) : [];
      const suggestedText = Array.isArray(achievement.suggestedSkills) ? achievement.suggestedSkills.join(' ') : '';
      const text = [achievement.title, achievement.desc, achievement.role, achievement.originalText, suggestedText].filter(Boolean).join(' ');
      const materialUrl = materials.find(line => /^https?:\/\//i.test(String(line).trim()));
      const resolvedUrl = achievement.artifactUrl || (materialUrl ? String(materialUrl).trim() : null);
      const draftEv = { id: achievement.id || 'ev_legacy_' + (djb2(text + '|' + achievement.type) >>> 0).toString(36),
        title: achievement.title || '成果 ' + (index + 1), description: [achievement.role ? '角色：' + achievement.role : '', achievement.desc || ''].filter(Boolean).join(' · '), type: achievement.type,
        courseId: resolveCourseId(achievement.title, major), skillIds: [...new Set(extractSkillsFromText(text).map(s => s.skillId))],
        verificationStatus: achievement.verificationStatus || 'unverified', observedAt: achievement.observedAt || null,
        artifactUrl: resolvedUrl, hasPortfolio: !!(resolvedUrl || materials.length),
        verified: achievement.verificationStatus === 'user_confirmed' || !!achievement.verified,
        metrics: Array.isArray(achievement.metrics) ? achievement.metrics : [] };
      draftEv.type = canonicalEvidenceType(draftEv);
      evidences.push(draftEv);
    }
    if (!hasHardcoreExperience({ evidences })) {
      const designCourseRe = /课程设计|课设|综合.*实践|创新实践|实训|综合实验|近代物理实验|建模竞赛训练|学年论文|毕业设计|毕业论文/;
      for (const [idx, course] of courseRecords.entries()) {
        if (!course?.name || !designCourseRe.test(course.name)) continue;
        if (!isCompletedStatus(course.status) && !['在修', 'in_progress'].includes(course.status)) continue;
        if (evidences.some(e => e.title === course.name || (course.id && e.courseId === course.id))) continue;
        const taught = course.id ? (COURSE_BY_ID.get(course.id)?.teaches || []) : [];
        const extracted = extractSkillsFromText(course.name + ' ' + (course.major || p.major || '')).map(s => s.skillId);
        const skillIds = [...new Set([...taught, ...extracted])];
        if (!skillIds.length) continue;
        const done = isCompletedStatus(course.status);
        evidences.push({
          id: 'ev_cdesign_' + (djb2(course.name + '|' + idx) >>> 0).toString(36),
          title: course.name,
          description: '专业实践与课程设计环节（来自已修课程档案）',
          type: '课设',
          courseId: course.id || null,
          skillIds,
          verificationStatus: done ? 'user_confirmed' : 'unverified',
          observedAt: null,
          artifactUrl: null,
          hasPortfolio: false,
          verified: done,
          metrics: [],
        });
      }
    }
    const graduationDate = /^20\d\d-(?:0[1-9]|1[0-2])$/.test(p.graduationDate || '') ? p.graduationDate : null;
    const graduationYear = graduationDate ? Number(graduationDate.slice(0, 4)) : null;
    return { schemaVersion: EMPLOYMENT_SCHEMA_VERSION, major, majorRaw: p.major || '', degree: DEGREE_RANK[p.degree] ? p.degree : null,
      graduationDate, graduationYear, graduationDateSource: graduationDate ? p.graduationDateSource || 'user_confirmed' : null,
      gpaPercent: typeof p.gpa === 'number' && Number.isFinite(p.gpa) ? p.gpa : null,
      rank: p.rank > 0 && p.rankTotal >= p.rank ? { position: p.rank, total: p.rankTotal } : null,
      inProgressCourseIds: inProgress.map(course => course.id).filter(Boolean), completedCourseSkillIds, inProgressCourseSkillIds,
      preferences: st.jobs?.preferences || {}, personalized: st.jobs?.personalized !== false,
      completedCourseIds, evidences, weeklyHours: p.weeklyHours || 8,
      internWindow: p.intern && p.intern !== '未确定' ? p.intern : null,
      intendedPaths: (st.paths || []).map((k) => PATH_MAP[k]).filter(Boolean),
      targetReqIds: (st.jobs && st.jobs.targetReqIds) || [], isStudentCadre: !!p.isStudentCadre };
  }

  /* ---- Phase3 推荐维度：专业对口 / 项目关联 / 薪资归一 / 三档推荐（全部确定性，匹配度≠录取概率） ---- */
  const MAJOR_GROUP = { cs: '理工', mat_mech: '理工', econ: '经管', chinese: '人文' };
  function majorAlignmentOf(p, req) {
    const ms = req.majors || [];
    if (!p.major || !ms.length) return { level: '依据不足', score: null };
    if (ms.includes(p.major)) return { level: '对口', score: 1 };
    const g = MAJOR_GROUP[p.major];
    if (g && ms.some((m) => MAJOR_GROUP[m] === g)) return { level: '相关', score: 0.6 };
    return { level: '跨专业', score: 0.25 };
  }
  const MATCH_WEIGHTS = { skills: 0.40, project: 0.26, internship: 0.10, direction: 0.08, location: 0.06, jobType: 0.04, salary: 0.02, portfolio: 0.04 };
  function scoreMatchFactors(factors, weights) {
    if (factors.skills == null && factors.project == null && factors.internship == null) return null;
    const active = Object.keys(MATCH_WEIGHTS).filter(key => factors[key] != null);
    const total = active.reduce((sum,key) => sum + weights[key], 0);
    return total ? Math.round(100 * active.reduce((sum,key) => sum + weights[key] * factors[key], 0) / total) : null;
  }
  const TAXONOMY_VERSION = '2026.11.3';
  const CAREER_DIRECTIONS = [
    ['hardware', '硬件与电子电路', 'mat_mech', ['analog_digital', 'pcb', 'mcu', 'fpga_verilog'], [
      ['circuits', '硬件开发 / 电路设计', ['硬件工程师', '电路设计', '电源工程', 'pcb', '模拟ic设计', '芯片后端', '数字后端', 'ic设计', 'ic验证', 'fpga', '射频工程师', 'dram设计验证', 'dram design verification', '光学工程', '光电子', '中性原子系统']]],
    ],
    ['embedded', '嵌入式软硬件', 'mat_mech', ['embedded_c', 'mcu', 'rtos', 'industrial_bus', 'ros_slam'], [
      ['firmware', 'MCU / 固件', ['固件', 'mcu', 'stm32', '单片机', '嵌入式软件']],
      ['drivers', 'BSP / 驱动', ['bsp', '驱动开发', '设备驱动', '电机驱动']],
      ['embedded-linux', 'Embedded Linux / IoT / ROS', ['嵌入式', '物联网', 'iot', 'linux系统', 'ros', 'slam']],
    ]],
    ['mechanical', '机械设计与结构', 'mat_mech', ['cad_drawing', 'solidworks', 'mechanics_of_materials', 'finite_element'], [
      ['mechanical-design', '机械与结构设计', ['机械设计', '结构工程', '结构设计', '仿真工程', 'cae', '传动研发', '热设计', '工业设计']],
    ]],
    ['automation', '自动化与控制', 'mat_mech', ['plc', 'control_system', 'industrial_bus', 'ros_slam'], [
      ['automation-control', 'PLC / 运动控制', ['plc', '自动化', '运动控制', '机器人控制', '电机控制', '电气控制', '电气工程', '规控', 'motor and electronic control']],
    ]],
    ['reliability', '测试与可靠性', 'mat_mech', ['quality_control', 'experiment_design', 'analog_digital'], [
      ['hardware-testing', '硬件测试与可靠性', ['硬件测试', '可靠性', '环境试验', 'emc', '电性能测试', 'gtt tvc', '售后技术支持', '技术支持工程师']],
    ]],
    ['manufacturing', '制造 / 工艺 / 设备', 'mat_mech', ['process_engineering', 'quality_control', 'spc_six_sigma', 'cad_drawing'], [
      ['process', '工艺与制造工程', ['工艺工程', '制造工程', '设备工程', '工艺开发', 'npi', '质量工程', '采购开发工程师', '供应链', '生产副经理', '检验员',
        '器件工艺研发', '发动机工艺设计', '精益工程师', '精益储干', 'sqe助理工程师', '机电技术员', '机电管培生', 'plant trainee (数字化/ai方向)']],
    ]],
    ['materials', '电池与材料工程', 'mat_mech', ['battery_materials', 'materials_science', 'experiment_design', 'process_engineering'], [
      ['battery-development', '电池研发与验证', ['电芯开发', '光伏电池研发', '材料研发', '高分子', '化工研发']],
    ]],
    ['software', '软件开发', 'cs', ['java', 'golang', 'javascript', 'sql_rdbms', 'redis', 'git_collab', 'api_design'], [
      ['backend', '服务端与全栈', ['后端', '后台开发', '服务端', '全栈', 'java开发', 'go开发', 'golang', '软件开发', '运营开发', '研发工程师']],
      ['frontend', '前端与客户端', ['前端', '客户端', '安卓', 'android', 'ios开发', '小程序开发']],
    ]],
    ['data', '数据与人工智能', 'cs', ['python', 'data_analysis', 'sql_bi', 'statistics', 'ml_basics', 'deep_learning', 'computer_vision', 'ros_slam', 'llm_app_dev', 'ai_agent_workflow'], [
      ['data-analysis', '数据工程与分析', ['数据分析', '数据开发', '数据工程', '商业分析', '数据科学']],
      ['machine-learning', '算法与机器学习', ['算法', '机器学习', '大模型', '深度学习', 'ai工程', 'ai for science', '视觉算法', '3d视觉', '双目视觉', '感知算法', '多模态', '具身智能', '机器人算法', '自动驾驶', '物理ai']],
      ['ai-applications', 'AI 应用与评测', ['agent开发', 'agent 开发', 'ai agent', 'ai应用工程师', 'ai评测分析师', 'ai安全']],
    ]],
    ['systems', '系统与测试', 'cs', ['os', 'cpp_modern', 'computer_networks', 'linux_deploy', 'cloud_k8s', 'software_testing'], [
      ['software-quality', '软件测试与运维', ['软件测试', '测试开发', '运维', '网络安全', '信息安全', 'security engineer', '云计算', '测试与质量管理', 'gms认证测试']],
      ['systems-development', '系统开发与基础架构', ['高性能计算', '基础架构', '游戏引擎开发', '流媒体开发', 'c++开发', '系统工程']],
    ]],
    ['product', '产品与数字运营', 'econ', ['competitive_analysis', 'market_research', 'business_analysis', 'growth_ops', 'content_ops'], [
      ['product-operations', '产品与运营', ['产品经理', '产品运营', '用户运营', '市场运营', '内容运营', '产品策划', '商家产品', '电商运营', '跨境电商', '类目运营', '游戏策划', '游戏发行', '行业运营', '运营管理', '客群运营', '客服系统运营', '项目管理', '项目实习生-产品']],
      ['brand-marketing', '品牌、市场与用户研究', ['市场营销', '市场实习生', '市场研究', '用户研究', '品牌公关', '公关', '品牌传播', '品牌策划', '营销管培生', '社媒运营', '商务拓展', '客户成功', '解决方案', '产品商务', '项目实习生-市场', '销售', '医药代表', '城市经理', '商务专员']],
    ]],
    ['content', '内容与传播', 'chinese', ['copywriting', 'new_media_ops', 'video_editing', 'language_norm'], [
      ['editorial', '编辑、策划与新媒体', ['编辑', '文案', '内容策划', '新媒体', '创作', '编导实习生', '漫剧发行运营', '内容培训生', '视频设计师', '音频策划', '文化交流']],
      ['visual-design', '视觉与交互设计', ['视觉设计', '交互设计', '技术美术', '角色设计', 'ui设计', '创意设计', '品牌设计', '游戏动效设计', '动画', '平面设计', '原画']],
    ]],
    ['finance', '财务、投资与风控', 'econ', ['financial_accounting', 'audit_basics', 'financial_modeling', 'valuation', 'industry_research'], [
      ['finance-accounting', '财务、会计与审计', ['审计岗位', '审计专员', '审计实习生', '财务管理岗', '财务实习生', '费用会计', '税务咨询顾问', '应收实习生', '费用实习生', '财经线', '会计', '采购商务']],
      ['finance-investment', '投研、估值与风险管理', ['投资分析', '投资助理', '投资专员', '投资研究岗', '金融风险管理', '金融合规', '资质合规', '法务', '专利', '风险管理岗', '精算定价', '内控与风险管理', '投资银行类', '投资者关系', '产业研究', '生态研究', '车险']],
    ]],
    ['people', '人力资源与组织支持', 'econ', ['project_mgmt', 'teamwork_comm', 'office_advanced', 'market_research'], [
      ['people-operations', '招聘与人力运营', ['人力资源', '人力运营', '人事行政实习', '招聘专员', '招聘实习生', '校园招聘中台', '人力管培生', 'ai-hr培训生', 'hr信息智能化']],
      ['office-administration', '行政与组织文化', ['行政管理', '行政实习生', '活动行政', '企业文化', '秘书', '公共事务']],
    ]],
    ['education', '教学与培训', 'chinese', ['teaching_design', 'logic_expression', 'language_norm', 'teamwork_comm'], [
      ['education-training', '学科教学、教研与培训', ['一对一教师', '校招教师', '主讲教师', '主讲老师', '教研实习生', '学业管理助教', '培训设计与教研', '培训讲师', '讲师运营', '课程顾问']],
    ]],
  ].map(([id, name, domain, skillIds, families]) => ({ id, name, domain, skillIds,
    families: families.map(([familyId, familyName, roles]) => ({ id: familyId, directionId: id, name: familyName, roles })) }));
  const JOB_FAMILIES = CAREER_DIRECTIONS.flatMap(direction => direction.families);
  const FAMILY_BY_ID = new Map(JOB_FAMILIES.map(family => [family.id, family]));
  const LEARNING_RESOURCES = {
    mcu: ['ST 的 STM32 技术文档', 'https://www.st.com/en/microcontrollers-microprocessors/stm32-32-bit-arm-cortex-mcus/documentation.html'],
    industrial_bus: ['Modbus 规范与实施指南', 'https://www.modbus.org/modbus-specifications'],
    rtos: ['FreeRTOS 文档', 'https://www.freertos.org/Documentation/00-Overview'],
    java: ['Dev.java 教程', 'https://dev.java/learn/'],
    python: ['Python 官方教程', 'https://docs.python.org/zh-cn/3/tutorial/index.html'],
    git_collab: ['Git 官方参考', 'https://git-scm.com/docs'],
    sql_rdbms: ['PostgreSQL 官方文档', 'https://www.postgresql.org/docs/'],
  };
  function jobFamilyOf(req) {
    if (req.jobFamilyId && FAMILY_BY_ID.has(req.jobFamilyId)) return FAMILY_BY_ID.get(req.jobFamilyId);
    const title = String(req.title || '').toLowerCase();
    let best = null;
    let length = 0;
    for (const family of JOB_FAMILIES) for (const alias of family.roles) {
      if (alias.length > length && (isAscii(alias)
        ? new RegExp('(?<![a-z])' + escapeRegExp(alias) + '(?![a-z])').test(title)
        : title.includes(alias))) {
        best = family;
        length = alias.length;
      }
    }
    return best;
  }
  function careerDirections(p, reqs, now = new Date()) {
    const signals = matchProfileSignals(p, now);
    const prefs = p.preferences || {};
    const intentText = String(prefs.otherDirection || '').trim().toLowerCase();
    const intentSkillIds = intentText ? new Set(extractSkillsFromText(intentText).map(s => s.skillId)) : new Set();
    const familiarity = (map, ids) => {
      const denom = Math.min(3.5, ids.length || 1);
      return Math.min(1, ids.reduce((sum, id) => sum + (map.get(id) || 0), 0) / denom);
    };
    const jobsByDirection = Map.groupBy(distinctPostings(reqs.filter(req => req.kind==='job'),now).filter(req=>!jobFreshness(req,now).ended),
      req => jobFamilyOf(req)?.directionId);
    const hasStrongEvidence = signals.project.size >= 3 || signals.internship.size >= 2;
    const majorWeight = hasStrongEvidence ? 0.10 : 0.20;
    return CAREER_DIRECTIONS.map(direction => {
      const { id, skillIds } = direction;
      const related = jobsByDirection.get(id) || [];
      let intentBoost = null;
      if (intentText) {
        const hitRole = direction.families.some(f => f.roles.some(r => r.length >= 2 && intentText.includes(r.toLowerCase())));
        const hitSkills = skillIds.filter(sid => intentSkillIds.has(sid)).length;
        if (hitRole || hitSkills >= 2) intentBoost = 1;
        else if (hitSkills === 1) intentBoost = 0.7;
      }
      const interest = prefs.primaryDirectionId === id ? 1 : prefs.secondaryDirectionIds?.includes(id) ? 0.8 : intentBoost;
      const majorPrior = p.major && (p.major === direction.domain ? 1 : MAJOR_GROUP[p.major] === MAJOR_GROUP[direction.domain] ? 0.55 : 0.2);
      const cityFit = related.length && prefs.cities?.length ? related.filter(req => req.locations?.some(city => prefs.cities.includes(city))).length / related.length : null;
      const typeFit = related.length && prefs.jobTypes?.length ? related.filter(req => prefs.jobTypes.includes(jobTypeOf(req))).length / related.length : null;
      const factors = [[majorWeight, majorPrior], [0.22, signals.exposure.size ? familiarity(signals.exposure, skillIds) : null],
        [0.32, signals.project.size ? familiarity(signals.project, skillIds) : null], [0.14, signals.internship.size ? familiarity(signals.internship, skillIds) : null],
        [0.14, interest], [0.04, cityFit], [0.04, typeFit]].filter(([, value]) => value != null);
      const weights = factors.reduce((sum, [weight]) => sum + weight, 0);
      return { ...direction, score: weights ? Math.round(100 * factors.reduce((sum, [weight, value]) => sum + weight * value, 0) / weights) : null,
        signals: skillIds.filter(skill => signals.exposure.has(skill)), gaps: skillIds.filter(skill => !signals.exposure.has(skill)),
        count: related.length, excluded: prefs.excludedDirectionIds?.includes(id) || false };
    }).sort((a, b) => Number(a.excluded) - Number(b.excluded) || (b.score ?? -1) - (a.score ?? -1) || b.count - a.count);
  }
  const jobTypeOf = req => req.jobType || (req.kind === 'competition' ? 'competition'
    : /实习/.test(req.experience || req.recruitmentType || '') ? 'intern'
      : /社招|正式岗位/.test(req.experience || req.recruitmentType || '') ? 'social' : 'campus');
  const sourceReliability = req => ({ A_OFFICIAL: 1, B_EXPERIENCE: 0.7 }[req.citation?.trustTier] || 0.35);
  const LINK_LABEL = { job_detail: '打开原岗位', project_page: '打开招聘项目', job_list: '打开岗位列表',
    company_career_home: '打开企业招聘官网', school_notice: '打开高校招聘公告', aggregator_page: '打开聚合来源', unknown: '打开来源页面' };
  const STATUS_LABELS = { confirmed_active: '来源明确在招', observed_active: '快照观测到岗位', unknown: '招聘状态待确认',
    stale: '观测已陈旧 · 可能失效', expired: '已过投递截止日期', closed: '已确认下架', archived: '历史归档' };
  const dayMs = 86400000;
  const dateValue = (value, endOfDay = false) => Date.parse(/^\d{4}-\d\d-\d\d$/.test(value || '')
    ? value + (endOfDay ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00') : value || '');
  function sourceSnapshotOf(req) {
    if (req.sourceSnapshot) return req.sourceSnapshot;
    const date = req.snapshotDate || null;
    const tencent = /^tx_/.test(req.id);
    return { sourceId: tencent ? 'src_tencent' : null, snapshotAt: date, lastSeenAt: tencent ? date : null,
      status: tencent ? 'observed_active' : 'unknown', linkScope: tencent
        ? req.postUrl === 'https://join.qq.com' ? 'company_career_home' : /\/post\.html\?query=p_\d+$/.test(req.postUrl || '') ? 'job_detail' : 'unknown'
        : 'unknown' };
  }
  function jobFreshness(req, now = new Date()) {
    const snapshot = sourceSnapshotOf(req);
    const nowMs = now.getTime();
    const observed = dateValue(snapshot.lastSeenAt);
    const sourceObserved = dateValue(snapshot.sourceLastOkAt);
    const deadline = dateValue(snapshot.applyEndAt, true);
    const ageDays = Number.isFinite(observed) && observed <= nowMs ? (nowMs - observed) / dayMs : null;
    let status = Object.hasOwn(STATUS_LABELS, snapshot.status) ? snapshot.status : 'unknown';
    if (!['closed', 'archived'].includes(status) && Number.isFinite(deadline) && deadline < nowMs) status = 'expired';
    const ended = ['closed', 'archived', 'expired'].includes(status);
    const staleDays = status === 'confirmed_active' ? 21 : 14;
    if (!ended && (ageDays > staleDays || (Number.isFinite(sourceObserved) && nowMs - sourceObserved > 14 * dayMs))) status = 'stale';
    else if (!ended && ageDays == null && ['observed_active', 'confirmed_active'].includes(status)) status = 'unknown';
    const statusFactor = { confirmed_active: 1, observed_active: 0.85, unknown: 0.5, stale: 0.25 }[status] || 0;
    return { ...snapshot, status, label: STATUS_LABELS[status], ended, ageDays,
      score: round3(sourceReliability(req) * (ageDays == null ? 0.5 : Math.exp(-ageDays / 21)) * statusFactor) };
  }
  function postingIdentity(req) {
    const separate = 'record:'+req.id;
    const source = req.sourceSnapshot;
    if((req.kind&&req.kind!=='job')||req.userImported||source?.linkScope!=='job_detail'||!req.jdHash||!URL.canParse(req.postUrl)) return separate;
    const url = new URL(req.postUrl);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password) return separate;
    const id = source.sourceJobId;
    let posting = url.origin+url.pathname+url.search;
    // Cross-portal matches require the same provider ID in both source metadata and the job-detail link.
    if(source.sourceId?.startsWith('beisen-')&&/^\/(?:campus|intern|social)\/detail\/?$/i.test(url.pathname)&&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||'')&&url.searchParams.get('jobAdId')===id) posting='beisen:'+id;
    if(source.sourceId?.startsWith('hotjob-')&&/(?:^|\.)hotjob\.cn$/i.test(url.hostname)&&/\/pb\/posDetail\.html$/i.test(url.pathname)&&
      /^[a-f0-9]{24}$/i.test(id||'')&&url.searchParams.get('postId')===id) posting='hotjob:'+id;
    return 'posting:'+JSON.stringify([posting,req.title,req.jdHash,[...new Set(req.locations||[])].sort(),jobTypeOf(req)]);
  }
  function distinctPostings(items, now = new Date(), posting = item=>item) {
    const groups = new Map();
    const observedAt = source => Math.max(dateValue(source.lastSeenAt)||0,dateValue(source.closedAt)||0);
    for (const item of items) {
      const req=posting(item),key=postingIdentity(req),previous=groups.get(key);
      if(!previous){ groups.set(key,{item,req}); continue; }
      const recent=jobFreshness(req,now), prior=jobFreshness(previous.req,now);
      const order=observedAt(recent)-observedAt(prior)||sourceReliability(req)-sourceReliability(previous.req)||
        Number(recent.ended)-Number(prior.ended)||recent.score-prior.score||previous.req.id.localeCompare(req.id);
      if(order>0) groups.set(key,{item,req});
    }
    return [...groups.values()].map(group=>group.item);
  }
  function matchProfileSignals(p, now) {
    const exposure = new Map();
    const project = new Map();
    const internship = new Map();
    const portfolio = new Map();
    const evidenceRefs = new Map();
    const put = (map, key, value) => map.set(key, Math.max(value, map.get(key) || 0));
    for (const id of p.inProgressCourseIds || []) for (const skill of COURSE_BY_ID.get(id)?.teaches || []) put(exposure, skill, 0.15);
    for (const skill of p.inProgressCourseSkillIds || []) put(exposure, skill, 0.15);
    for (const id of p.completedCourseIds) for (const skill of COURSE_BY_ID.get(id)?.teaches || []) put(exposure, skill, 0.25);
    for (const skill of p.completedCourseSkillIds || []) put(exposure, skill, 0.25);
    const coldStart = !hasHardcoreExperience(p);
    for (const evidence of p.evidences) {
      const verification = VERIFICATION_FACTOR[verificationOf(evidence)];
      if (!verification) continue;
      const kind = evidenceKindOf(evidence);
      const typeWeight = kind === 'coursework' && coldStart
        ? 0.68
        : (EVIDENCE_TYPE_WEIGHT[kind] ?? EVIDENCE_TYPE_WEIGHT.other);
      const age = dateValue(evidence.observedAt);
      const freshness = Number.isFinite(age) ? Math.max(0.65, 1 - Math.max(0, now.getTime() - age) / (1460 * dayMs)) : 0.95;
      const strength = verification * clamp(evidence.quality ?? 0.92, 0, 1) * freshness * typeWeight;
      for (const id of evidence.skillIds) {
        if (kind === 'internship') {
          put(exposure, id, strength);
          put(project, id, strength);
          put(internship, id, strength);
        } else if (kind === 'coursework') {
          put(exposure, id, Math.min(coldStart ? 0.72 : 0.42, strength));
          put(project, id, strength * (coldStart ? 0.92 : 0.85));
        } else {
          put(exposure, id, strength);
          put(project, id, strength);
        }
        if (evidence.hasPortfolio || evidence.artifactUrl) {
          put(portfolio, id, kind === 'coursework' ? strength * (coldStart ? 0.85 : 0.6) : strength);
        }
        evidenceRefs.set(id, [...(evidenceRefs.get(id) || []), evidence.id]);
      }
    }
    const completeness = [p.major, p.graduationYear, p.degree, p.completedCourseIds.length, project.size || internship.size,
      p.evidences.some(hasVerifiedEvidence)].filter(Boolean).length / 6;
    return { exposure, project, internship, portfolio, evidenceRefs, completeness };
  }
  function employmentEvidenceMappings(profile, now = new Date()) {
    if (profile.personalized===false) return [];
    const mappings=[];
    const courseSkills=(courseIds,explicitIds)=>[...new Set([
      ...courseIds.flatMap(id=>COURSE_BY_ID.get(id)?.teaches||[]),...explicitIds,
    ])];
    for (const [status,ids,extra] of [
      ['completed',profile.completedCourseIds||[],profile.completedCourseSkillIds||[]],
      ['in_progress',profile.inProgressCourseIds||[],profile.inProgressCourseSkillIds||[]],
    ]) {
      for(const skillId of courseSkills(ids,extra)){
        const known = ids.filter(id=>COURSE_BY_ID.get(id)?.teaches.includes(skillId)).map(courseName);
        mappings.push({ skillId, source:'course', status, contribution:'exposure',
          titles:known.length?known:[status==='completed'?'已完成的课程':'在修课程'] });
      }
    }
    for(const evidence of profile.evidences){
      const status=verificationOf(evidence);
      if(status==='rejected') continue;
      const observed=dateValue(evidence.observedAt);
      const ageDays=Number.isFinite(observed)&&observed<=now.getTime()?Math.floor((now.getTime()-observed)/dayMs):null;
      for(const skillId of evidence.skillIds) mappings.push({
        skillId,source:'evidence',status,contribution:'practice', title:evidence.title, type:evidence.type||'成果',
        artifact:!!evidence.artifactUrl, ageDays, evidenceId:evidence.id,
      });
    }
    return mappings.filter(mapping=>SKILL_BY_ID.has(mapping.skillId));
  }
  function matchFactors(p, signals, req, major) {
    const uniqueSkills = dedupeSkillsById(req.skills);
    const total = uniqueSkills.reduce((sum, skill) => sum + skill.weight, 0);
    const fit = (map, forceZero = false) => total && (map.size || (forceZero && signals.exposure.size))
      ? uniqueSkills.reduce((sum, skill) => sum + skill.weight * (map.get(skill.skillId) || 0), 0) / total
      : null;
    const prefs = p.preferences || {};
    const salary = salaryMonthlyOf(req);
    const family = jobFamilyOf(req);
    const roleDirection = family ? prefs.primaryDirectionId === family.directionId ? 1
      : prefs.secondaryDirectionIds?.includes(family.directionId) ? 0.85
        : prefs.excludedDirectionIds?.includes(family.directionId) ? 0 : null : null;
    return { skills: fit(signals.exposure), project: fit(signals.project, true), internship: fit(signals.internship, true),
      direction: roleDirection ?? major.score, location: prefs.cities?.length && req.locations?.length
        ? Number(req.locations.some(city => prefs.cities.includes(city))) : null,
      jobType: prefs.jobTypes?.length ? Number(prefs.jobTypes.includes(jobTypeOf(req))) : null,
      salary: prefs.salaryMin > 0 && salary != null ? Math.min(1, salary / prefs.salaryMin) : null,
      portfolio: fit(signals.portfolio) };
  }
  const TIER_META = {
    priority: { label: '优先投递', color: '#1E3F32', bg: '#E6EFEA' },
    worth: { label: '值得尝试', color: '#9a6b15', bg: '#f6ecd9' },
    challenge: { label: '挑战岗位', color: '#C84B31', bg: '#f7e3dd' },
  };
  function recommendTierOf(m) {
    if (m.freshness.ended) return { tier: 'challenge', reason: m.freshness.label + '。可保留作历史分析。' };
    if (m.eligibility.status === 'FAIL') return { tier: 'challenge', reason: '明确门槛未满足（' + m.eligibility.failed[0].label + '）。' };
    if (m.matchScore == null || m.confidence < 0.4) return { tier: 'challenge', reason: '匹配依据不足。补充档案成果，或查看原文确认招聘条件。' };
    const related = m.coveredSkillIds.slice(0, 3).map(skillName).join('、');
    const evidence = (related ? '已覆盖 ' + related + ' 等 ' + m.coveredSkillIds.length + ' 项技能' : '暂无可显示的岗位技能覆盖')
      + (m.evidenceRefs.length ? '，关联 ' + m.evidenceRefs.length + ' 条成果。' : '。');
    if (m.eligibility.status === 'PASS' && m.matchScore >= 75 && m.confidence >= 0.6 &&
      ['confirmed_active', 'observed_active'].includes(m.freshness.status))
      return { tier: 'priority', reason: evidence + ' 已核对的资格符合，建议优先核实官网后投递。' };
    if (m.matchScore >= 55) return { tier: 'worth', reason: evidence + (m.eligibility.status === 'UNKNOWN' ? ' 投递前先核验资格。' : ' 复核招聘状态和待补证据。') };
    return { tier: 'challenge', reason: evidence + ' 按反推路线补齐重点缺口。' };
  }
  function jobApplicationPlan(match, profile) {
    const {req, eligibility, freshness} = match;
    if (req.kind !== 'job' || profile.personalized === false) return null;
    const stage = freshness.ended ? 'historical' : eligibility.status === 'FAIL' ? 'blocked'
      : !['confirmed_active','observed_active'].includes(freshness.status) ? 'verify_source'
      : eligibility.status === 'UNKNOWN' ? 'verify_eligibility' : match.tier === 'challenge' ? 'prepare' : 'apply';
    if (stage === 'historical' || stage === 'blocked') return {stage, profileFields:[], materials:[], practice:null};

    const gate = req.hardGate || {};
    const checkableFromProfile = {graduation:!!gate.graduationYears?.length,degree:!!gate.minDegree,gpa:true,rank:true};
    const profileFields = eligibility.pending.map(check=>check.key).filter(key=>checkableFromProfile[key]===true);
    const requirements = new Map(jobRequirementsOf(req).map(item=>[item.skillId,item]));
    const rank = skillId => ({required:0,preferred:1,contextual:2})[requirements.get(skillId)?.importance] ?? 3;
    const targetSkills = new Set(req.skills.map(skill=>skill.skillId));
    const evidence = new Map(profile.evidences.map(item=>[item.id,item]));
    const materials = buildGroundedBullets(profile,req.id).flatMap(bullet=>{
      const item = evidence.get(bullet.evidenceId);
      const skillIds = [...new Set(item.skillIds.filter(skillId=>targetSkills.has(skillId)))].sort((a,b)=>rank(a)-rank(b));
      if (!skillIds.length) return [];
      return [{...bullet,title:item.title,confirmed:hasVerifiedEvidence(item),skillIds,
        requirement:requirements.get(skillIds[0])||null}];
    }).sort((a,b)=>Number(b.confirmed)-Number(a.confirmed)||rank(a.skillIds[0])-rank(b.skillIds[0])||b.skillIds.length-a.skillIds.length);
    const gap = computeGaps(profile,[req.id]).filter(item=>item.status!=='evidenced').sort((a,b)=>rank(a.skillId)-rank(b.skillId))[0];
    const practice = gap ? {gap,task:roadmapTaskOf(gap),requirement:requirements.get(gap.skillId)||null} : null;
    return {stage, profileFields, materials:materials.slice(0,2), practice};
  }
  const TIER_ORDER = { priority: 0, worth: 1, challenge: 2 };
  function compareMatches(a, b) {
    return Number(a.freshness.ended) - Number(b.freshness.ended)
      || Number(a.eligibility.status === 'FAIL') - Number(b.eligibility.status === 'FAIL')
      || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
      || (b.matchScore ?? -1) - (a.matchScore ?? -1) || b.confidence - a.confidence
      || b.freshness.score - a.freshness.score || a.req.id.localeCompare(b.req.id);
  }
  function rankWithMatchWeights(results, weights) {
    const keys = Object.keys(MATCH_WEIGHTS);
    if (Object.keys(weights).length !== keys.length ||
      keys.some(key => !Number.isFinite(weights[key]) || weights[key] <= 0) ||
      Math.abs(keys.reduce((sum,key) => sum + weights[key], 0) - 1) > 1e-9) {
      throw new Error('Match weights must be positive and sum to 1');
    }
    return results.map(result => {
      const next = { ...result, matchScore:scoreMatchFactors(result.factors,weights) };
      const { tier, reason } = recommendTierOf(next);
      return { ...next, tier, tierReason:reason };
    }).sort(compareMatches);
  }
  function projectReviewProfile(p) {
    const directionIds = new Set(CAREER_DIRECTIONS.map(direction => direction.id));
    const prefs = p.preferences || {};
    const knownSkills = ids => [...new Set((ids || []).filter(id => SKILL_BY_ID.has(id)))];
    return {
      major: MAJOR_GROUP[p.major] ? p.major : null,
      graduationYear: Number.isInteger(p.graduationYear) ? p.graduationYear : null,
      degree: DEGREE_LABEL[p.degree] ? p.degree : null,
      completedCourseIds: p.completedCourseIds.filter(id => COURSE_BY_ID.has(id)),
      inProgressCourseIds: (p.inProgressCourseIds || []).filter(id => COURSE_BY_ID.has(id)),
      completedCourseSkillIds: knownSkills(p.completedCourseSkillIds),
      inProgressCourseSkillIds: knownSkills(p.inProgressCourseSkillIds),
      evidences: p.evidences.filter(evidence => verificationOf(evidence) !== 'rejected').map((evidence, index) => ({
        id: 'review_evidence_' + index,
        skillIds: knownSkills(evidence.skillIds),
        type: canonicalEvidenceType(evidence),
        verificationStatus: verificationOf(evidence),
      })).filter(evidence => evidence.skillIds.length),
      preferences: {
        primaryDirectionId: directionIds.has(prefs.primaryDirectionId) ? prefs.primaryDirectionId : null,
        secondaryDirectionIds: (prefs.secondaryDirectionIds || []).filter(id => directionIds.has(id)),
        excludedDirectionIds: (prefs.excludedDirectionIds || []).filter(id => directionIds.has(id)),
        jobTypes: (prefs.jobTypes || []).filter(type => ['campus','intern','social'].includes(type)),
      },
    };
  }
  function projectEmploymentMatchProfile(p) {
    const enabled=p.personalized!==false;
    if(!enabled) p={completedCourseIds:[],evidences:[],preferences:{}};
    const projected=projectReviewProfile(p);
    const knownCities=new Set(D.jobs.flatMap(job=>job.locations||[]));
    const rank=p.rank;
    return {...projected,personalized:enabled,
      gpaPercent:Number.isFinite(p.gpaPercent)&&p.gpaPercent>=0&&p.gpaPercent<=100?p.gpaPercent:null,
      rank:rank&&Number.isInteger(rank.position)&&Number.isInteger(rank.total)&&rank.position>0&&rank.position<=rank.total
        ?{position:rank.position,total:rank.total}:null,
      preferences:{...projected.preferences,cities:[...new Set((p.preferences?.cities||[]).filter(city=>knownCities.has(city)))],
        salaryMin:Number.isFinite(p.preferences?.salaryMin)&&p.preferences.salaryMin>0?p.preferences.salaryMin:null},
      evidences:p.evidences.flatMap(evidence=>{
        const verificationStatus=verificationOf(evidence);
        const skillIds=[...new Set(evidence.skillIds.filter(id=>SKILL_BY_ID.has(id)))];
        if(verificationStatus==='rejected'||!skillIds.length) return [];
        const observed=dateValue(evidence.observedAt);
        return [{skillIds,verificationStatus,type:canonicalEvidenceType(evidence),
          hasPortfolio:!!(evidence.hasPortfolio||evidence.artifactUrl),quality:clamp(evidence.quality??0.92,0,1),
          observedAt:Number.isFinite(observed)?new Date(observed).toISOString():null}];
      }),
    };
  }
  const PILOT_ANSWERS = {
    directionUseful:['yes','no','unsure'],
    scoreMeaning:['hiring_chance','verified_qualification','profile_alignment','unsure'],
    explanationEvidence:['yes','no','unsure'],
    roadmapActionable:['yes','no','unsure'],
  };
  function employmentPilotResponse(pilot) {
    if(pilot?.version!==1 || pilot.catalogHash!==snapshotHash(D.jobs) || pilot.matchVersion!==MATCH_VERSION ||
      !Number.isFinite(Date.parse(pilot.reviewedAt||''))) return null;
    const ids=pilot.topJobIds;
    if(!Array.isArray(ids)||ids.length>5||new Set(ids).size!==ids.length||
      ids.some(id=>!JOB_BY_ID.has(id))) return null;
    const answers=Object.fromEntries(Object.entries(PILOT_ANSWERS).filter(([key,allowed])=>allowed.includes(pilot.answers?.[key]))
      .map(([key])=>[key,pilot.answers[key]]));
    const topJobTrust=Object.fromEntries(ids.filter(id=>['yes','no','unsure'].includes(pilot.topJobTrust?.[id]))
      .map(id=>[id,pilot.topJobTrust[id]]));
    return {version:1,catalogHash:pilot.catalogHash,matchVersion:MATCH_VERSION,reviewedAt:pilot.reviewedAt,
      topJobIds:ids.slice(),answers,topJobTrust};
  }
  function buildEmploymentReview(p, feedback, now = new Date(), { caseId, relevance, pilot } = {}) {
    const projection = projectReviewProfile(p);
    const catalog = D.jobs;
    const postings=distinctPostings(allRequirements().filter(req=>req.kind==='job'&&!req.userImported),now)
      .filter(req=>!jobFreshness(req,now).ended);
    const active=forwardMatch(projection,postings,now).all;
    const remainder = active.slice(20);
    const remainingSlots = Math.min(20,remainder.length);
    const selections = [...active.slice(0,20), ...Array.from({ length:remainingSlots },
      (_, index) => remainder[Math.floor(index * remainder.length / remainingSlots)])];
    const candidates = selections.map(({ req }) => ({ jobId:req.id, title:req.title, company:req.org }))
      .sort((a,b) => (djb2(a.jobId) >>> 0) - (djb2(b.jobId) >>> 0) || a.jobId.localeCompare(b.jobId));
    const labels = Object.fromEntries(candidates.map(candidate => [candidate.jobId, { grade:null, explanationMatches:null }]));
    const studentFeedback = Object.fromEntries(catalog.flatMap(job => {
      const useful = feedback?.[job.id];
      const relevant = relevance?.[job.id];
      const response = {};
      if (useful === 'yes' || useful === 'no') response.explanationUseful = useful === 'yes';
      if (relevant === 'yes' || relevant === 'no') response.roleRelevant = relevant === 'yes';
      return Object.keys(response).length ? [[job.id,response]] : [];
    }));
    const pilotResponse=employmentPilotResponse(pilot);
    return {
      format:'course-compass-employment-review-v1', asOf:now.toISOString(), catalogHash:snapshotHash(catalog),
      matchVersion:MATCH_VERSION, taxonomyVersion:TAXONOMY_VERSION,
      cases:[{ caseId, projection, candidates, labels, studentFeedback, ...(pilotResponse?{pilot:pilotResponse}:{}) }],
    };
  }
  /* 薪资归一：仅把 JD 中明确写出的薪资折算成「月薪口径」用于同单位排序/筛选；展示保留原始单位与原文，未写=null（绝不臆造）。
   * 日薪按国家月计薪天数 21.75 折算；年薪÷12；月薪原值。 */
  function salaryParse(text) {
    if (!text) return null;
    const lines = String(text).split(/[\n。；;]/);
    const candidates = lines.map(line => {
      if (/薪资面议|薪酬面议|无薪/.test(line)) return '';
      const label = /(?:综合薪资|薪资待遇|薪酬待遇|薪资范围|月薪范围|日薪范围|无责底薪|基本工资|实习薪资|应届生月薪|薪资|薪酬|工资|日薪|月薪|年薪)[】\]）)]?\s*(?:[:：]|为|约|是)?\s*(?=\d)/.exec(line);
      if (label && !/(?:不|无|最低|最高|每月租金)$/.test(line.slice(0,label.index))) return { line: line.trim(),
        value: line.slice(label.index + label[0].length).split(/[、；;]|(?:另有|另享|餐补|餐费|住宿补贴|津贴)/)[0] };
      return /^\s*\d[^，、]*(?:元\/(?:天|日|月)|[Kk千]\/月|万\/(?:年|月))\s*(?:[·•]\s*\d{1,2}\s*薪)?\s*$/.test(line)
        && !/不低于|不超过|最低|最高|起薪/.test(line) ? { line: line.trim(), value: line.trim() } : null;
    }).filter(Boolean);
    if (!candidates.length) return null;
    const num = '(\\d{1,3}(?:[,]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
    const range = firstUnit => num + '(?:\\s*' + firstUnit + ')?\\s*[-－~～至—–]\\s*' + num;
    const pats = [
      { re: new RegExp(range('元(?:/天|/日)?') + '\\s*(?:元/天|元/日|/天|/日)'), unit: 'day', mul: 1 },
      { re: new RegExp(num + '\\s*(?:元/天|元/日)'), unit: 'day', mul: 1, single: true },
      { re: new RegExp(range('[Kk千](?:/月)?') + '\\s*[Kk千]/月'), unit: 'month', mul: 1000 },
      { re: new RegExp(range('万(?:/月)?') + '\\s*万/月'), unit: 'month', mul: 10000 },
      { re: new RegExp(range('元(?:/月)?') + '\\s*元/月'), unit: 'month', mul: 1 },
      { re: new RegExp(num + '\\s*[Kk千]/月'), unit: 'month', mul: 1000, single: true },
      { re: new RegExp(range('万(?:/年)?') + '\\s*万/年'), unit: 'year', mul: 10000 },
      { re: new RegExp(num + '\\s*元/月'), unit: 'month', mul: 1, single: true },
    ];
    for (const p of pats) {
      const hit = candidates.find(candidate => p.re.test(candidate.value));
      if (!hit) continue;
      const m = hit.value.match(p.re);
      const a = Number(m[1].replaceAll(',', '')) * p.mul, b = p.single ? a : Number(m[2].replaceAll(',', '')) * p.mul;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      let monthlyMin, monthlyMax;
      if (p.unit === 'day') { monthlyMin = round3(lo * 21.75); monthlyMax = round3(hi * 21.75); }
      else if (p.unit === 'year') { monthlyMin = round3(lo / 12); monthlyMax = round3(hi / 12); }
      else { monthlyMin = lo; monthlyMax = hi; }
      const mm = hit.line.match(/[·•]?\s*(\d{1,2})\s*薪/);
      return { min: lo, max: hi, unit: p.unit, months: mm ? parseInt(mm[1]) : null, raw: m[0].trim(),
        sourceSpan: hit.line, monthlyMin, monthlyMax };
    }
    return null;
  }
  function salaryMonthlyOf(req) { const s = req.salary; if (!s || typeof s !== 'object') return null; return s.monthlyMax != null ? s.monthlyMax : (s.monthlyMin != null ? s.monthlyMin : null); }
  function salaryTextOf(req) { const s = req.salary; if (!s) return '薪资未公开'; return typeof s === 'string' ? s : (s.raw || '薪资未公开'); }

  const JOB_TERM_LABELS = {
    internshipSchedule: '实习时长与出勤', mealsAndHousing: '餐饮与住宿', subsidies: '其他补贴',
    conversion: '转正与留用', otherBenefits: '其他福利',
  };
  const durationNumber = '[0-9一二两三四五六七八九十]+(?:[.．][0-9]+)?(?:\\s*(?:[-－至–—~～]|到)\\s*[0-9一二两三四五六七八九十]+)?';
  const termDuration = new RegExp(`实习(?!经历|经验|生|证明|薪|工资|津贴|补贴|待遇|留用)[^，,、]{0,16}${durationNumber}\\s*(?:个\\s*)?(?:月|周)|${durationNumber}\\s*(?:个\\s*)?(?:月|周)(?:以上|及以上)?\\s*(?:的)?实习(?:时间|期|$)`, 'i');
  const termAttendance = new RegExp(`(?:每周|一周|每(?:个)?星期)[^，,、]{0,16}${durationNumber}\\s*(?:天|(?:个\\s*)?工作日)|${durationNumber}\\s*days?\\s*(?:per|a|/)\\s*week`, 'i');
  const termRules = {
    mealsAndHousing: /餐补|饭补|餐饮补贴|餐费补贴|食堂补贴|就餐积分|包吃|包住|工作餐|房补|住房补贴|住宿补贴|员工宿舍|(?:提供|安排|解决|自理|无|不包)\s*(?:员工)?(?:住宿|食宿)|住宿自理|meal allowance|housing allowance/i,
    subsidies: /实习(?:补贴|津贴)|岗位补贴|交通(?:补贴|津贴)|通勤补贴|通讯补贴|高温补贴|internship stipend|commuting allowance/i,
    conversion: /(?:转正|留用)(?:的)?机会|(?:表现.{0,10}|优秀者|考核合格者|可申请|有望|机会)(?:可|有机会)?(?:转正|留用)|实习留用.{0,50}(?:唯一|必经)|(?:通过|参加).{0,6}转正考核|conversion opportunity/i,
    otherBenefits: /五险一金|六险[一二]金|带薪年假|(?:定期|年度|健康)体检|商业意外险/i,
  };
  function jobTermsOf(req) {
    const terms = Object.fromEntries(Object.keys(JOB_TERM_LABELS).map(key=>[key,[]]));
    if(req.kind==='competition'||!req.jdText) return terms;
    const intern = jobTypeOf(req)==='intern';
    for(const clause of req.jdText.matchAll(/[^\r\n。；;]+/g)){
      const sourceSpan = clause[0].trim();
      if(!sourceSpan||sourceSpan.length>350) continue;
      const start = clause.index + clause[0].indexOf(sourceSpan);
      const source = {sourceSpan,sourceOffset:[start,start+sourceSpan.length],parser:'rules'};
      const add = key => {
        if(terms[key].length<6&&!terms[key].some(item=>item.sourceSpan===sourceSpan)) terms[key].push(source);
      };
      if(termDuration.test(sourceSpan)||((intern||/实习|出勤|到岗/.test(sourceSpan))&&termAttendance.test(sourceSpan)))
        add('internshipSchedule');
      for(const [key,pattern] of Object.entries(termRules)) if(pattern.test(sourceSpan)) add(key);
    }
    return terms;
  }

  function jobRequirementsOf(req) {
    if (!req.jdText) return [];
    const found = new Map();
    for (const clause of req.jdText.matchAll(/[^\r\n。；;]+/g)) {
      const span = clause[0].trim();
      const start = clause.index + clause[0].indexOf(span);
      const importance = /优先|加分|更佳|preferred/i.test(span) ? 'preferred'
        : /必须|熟悉|精通|掌握|要求|must|required/i.test(span) ? 'required' : 'contextual';
      for (const skill of extractSkillsFromText(span)) {
        const key = skill.skillId;
        const entry = found.get(key);
        if (entry && ['required', 'preferred', 'contextual'].indexOf(entry.importance) <= ['required', 'preferred', 'contextual'].indexOf(importance)) continue;
        found.set(key, { id: req.id + ':skill:' + key, type: 'skill', skillId: key, textSpan: span, importance, hardGate: false,
          sourceOffset: [start, start + span.length], parser: 'rules', reviewStatus: 'unreviewed' });
      }
    }
    const model = req.modelRequirements;
    if (model?.jdHash === req.jdHash && req.jdHash && model.taxonomyVersion === TAXONOMY_VERSION && Array.isArray(model.items)) {
      for (const candidate of model.items) {
        const rule = found.get(candidate.skillId);
        if (!rule || !['required','preferred','contextual'].includes(candidate.importance) || candidate.confidence < 0.6 ||
          !Array.isArray(candidate.sourceOffset) || typeof candidate.textSpan !== 'string' ||
          req.jdText.slice(...candidate.sourceOffset) !== candidate.textSpan ||
          !extractSkillsFromText(candidate.textSpan).some(skill => skill.skillId === candidate.skillId)) continue;
        found.set(candidate.skillId, { ...rule, textSpan: candidate.textSpan, sourceOffset: candidate.sourceOffset,
          importance: candidate.importance, parser: 'local_model', confidence: candidate.confidence });
      }
    }
    return [...found.values()];
  }
  const JD_FACT_LABELS = {
    responsibilities: '岗位职责', hardRequirements: '明确任职条件', tools: '工具与平台',
    protocols: '协议与标准', domain: '业务领域', experience: '经验要求', softSkills: '通用能力',
    bonus: '加分条件', salary: '薪资原句', location: '地点原句', postedDate: '发布日期原句',
  };
  function jobFactsOf(req) {
    const facts = Object.fromEntries(Object.keys(JD_FACT_LABELS).map(key=>[key,[]]));
    const jd = req.jdText || '';
    const salary = salaryParse(jd);
    const headings = [
      ['responsibilities',/^(?:岗位职责|工作职责|职位职责|工作内容|responsibilities|what you will do)$/i],
      ['hardRequirements',/^(?:任职要求|职位要求|任职资格|资格要求|招聘条件|任职条件|qualifications|requirements)$/i],
      ['bonus',/^(?:加分项|加分条件|优先条件|preferred qualifications|nice to have)$/i],
    ];
    const rules = [
      ['hardRequirements', /(?:本科|专科|硕士|博士|学历|毕业|在校生|20\d{2}\s*届|bachelor|master.?s degree|phd|graduate in 20\d{2})/i],
      ['tools', /\b(?:Docker|Kubernetes|Git|Jenkins|Selenium|Playwright|MATLAB|STM32CubeIDE|Keil|SolidWorks|AutoCAD|Simulink|Flask|Linux|ROS\s*2?)\b/i],
      ['protocols', /\b(?:CAN\s*FD|Modbus|EtherCAT|AUTOSAR|TCP\/IP|UDS|ISO\s*26262|ISO\s*9001)\b|CAN\s*总线/i],
      ['domain', /(?:业务领域|业务方向|所属行业|industry domain)\s*[:：]/i],
      ['experience', /(?:经验|实习经历|项目经历|experience|internship background)/i],
      ['softSkills', /(?:团队协作|协调能力|沟通能力|学习能力|表达能力|communication skills|teamwork)/i],
      ['bonus', /(?:优先|加分|更佳|preferred|nice.to.have)/i],
      ['location', /^(?:工作地点|工作城市|职位地点|location)\s*[:：]/i],
      ['postedDate', /^(?:发布日期|发布时间|发布于|posted on|date posted)\s*[:：]?\s*\d{4}/i],
    ];
    const add = (key, sourceSpan, start) => {
      if (facts[key].length>=6 || facts[key].some(item=>item.sourceSpan===sourceSpan)) return;
      facts[key].push({ sourceSpan, sourceOffset:[start,start+sourceSpan.length], parser:'rules' });
    };
    let section = null;
    for(const line of jd.matchAll(/[^\r\n]+/g)){
      const raw = line[0].trim();
      if(!raw) continue;
      const heading = raw.match(/^(?:【([^】]+)】|[#*]*\s*([^：:]{2,35})\s*[：:]\s*)(.*)$/);
      const name = (heading ? heading[1] || heading[2] : raw).trim();
      const matchedHeading = headings.find(([,pattern])=>pattern.test(name));
      if(matchedHeading) section = matchedHeading[0];
      else if (/^【[^】]+】|^#{1,6}\s/.test(raw)) section = null;
      if(matchedHeading && !heading?.[3]?.trim()) continue;
      const body = (matchedHeading ? heading[3] : raw).trim();
      if(!body) continue;
      const base = line.index + line[0].lastIndexOf(body);
      for(const clause of body.matchAll(/[^。；;]+/g)){
        const span = clause[0].trim();
        if(!span || span.length>350) continue;
        const start = base + clause.index + clause[0].indexOf(span);
        if(section==='responsibilities'||section==='bonus') add(section,span,start);
        if(section===null && /^(?:(?:\d+[、.)．]|[-*])\s*)?(?:负责|参与|承担|协助|支持|构建|跟踪)/.test(span))
          add('responsibilities',span,start);
        for(const [key,pattern] of rules) {
          if(!pattern.test(span)) continue;
          if(key==='hardRequirements' && (section==='responsibilities'||section==='bonus'||/优先|加分|更佳|preferred|nice.to.have/i.test(span))) continue;
          add(key,span,start);
        }
      }
    }
    if(salary) add('salary',salary.sourceSpan,jd.indexOf(salary.sourceSpan));
    return {...facts,...jobTermsOf(req)};
  }
  function buildDomainPack(familyId, reqs, now = new Date()) {
    const family = FAMILY_BY_ID.get(familyId);
    if (!family) return null;
    const jobs = distinctPostings(reqs.filter(req=>req.kind==='job'&&!req.userImported&&req.jdText&&jobFamilyOf(req)?.id===familyId),now)
      .filter(req=>!jobFreshness(req,now).ended);
    const entries = new Map();
    for(const job of jobs) for(const item of jobRequirementsOf({...job,modelRequirements:null})){
      if (['teamwork_comm','logic_expression','office_advanced','project_mgmt','programming_basics'].includes(item.skillId)) continue;
      const entry=entries.get(item.skillId)||{skillId:item.skillId,skillName:skillName(item.skillId),required:0,preferred:0,contextual:0,examples:[]};
      entry[item.importance]++;
      const url = job.postUrl;
      if(entry.examples.length<2 && /^https?:\/\//i.test(url||'') && job.sourceSnapshot?.linkScope==='job_detail')
        entry.examples.push({jobId:job.id,url,sourceSpan:item.textSpan});
      entries.set(item.skillId,entry);
    }
    const skills=[...entries.values()].filter(entry=>entry.examples.length).map(entry=>{
      const mentions=entry.required+entry.preferred+entry.contextual;
      const category=jobs.length>=3 && entry.required>=2 && entry.required/jobs.length>=0.35 ? 'required'
        :entry.preferred>0 && entry.preferred>=entry.required ? 'preferred'
        :mentions>=2 ? 'common' : 'observed';
      const resource=LEARNING_RESOURCES[entry.skillId];
      return {...entry,mentions,category,resource:resource?{name:resource[0],url:resource[1]}:null};
    }).sort((a,b)=>b.required-a.required||b.mentions-a.mentions||a.skillId.localeCompare(b.skillId));
    return {taxonomyVersion:TAXONOMY_VERSION,familyId,name:family.name,asOf:now.toISOString(),sampleSize:jobs.length,skills};
  }
  function makeImportedJob(input, p) {
    const jdText = String(input.jdText || '').trim();
    if (!jdText || jdText.length > 18000) throw new Error('请粘贴岗位原文，长度上限 18,000 字。');
    const core = parseJdCore(p, jdText);
    const sourceUrl = input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl) ? input.sourceUrl : null;
    const id = 'import_' + (djb2(jdText + '|' + sourceUrl) >>> 0).toString(36);
    const locMatch = jdText.match(/(?:工作城市|工作地点|办公地点|实习地点|地点|Base)\s*[：:]\s*([^\n。；;]{2,30})/i);
    const knownCities = [...new Set(D.jobs.flatMap(j => j.locations || []))];
    const locations = locMatch ? knownCities.filter(c => locMatch[1].includes(c)) : [];
    return { id, kind: 'job', schemaVersion: EMPLOYMENT_SCHEMA_VERSION, userImported: true,
      title: input.title || core.jobTitle, org: input.org || '企业未填写', jobType: input.jobType || 'campus',
      category: '手动导入', locations, skills: core.skills.map(({ skillId, weight }) => ({ skillId, weight })),
      jdText, salary: salaryParse(jdText), postUrl: sourceUrl, hardGate: extractHardGateObject(jdText, {}),
      sourceSnapshot: { sourceId: 'user_import', linkScope: 'unknown', status: 'unknown', snapshotAt: new Date().toISOString() },
      citation: { sourceName: '个人导入 · 来源待核验', sourceUrl, trustTier: 'C_UNVERIFIED' } };
  }

  function parseJobLeads(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line,index)=>({ line:line.trim(), number:index+1 }))
      .filter(row=>row.line);
    const leads = [];
    const invalidRows = [];
    for (const row of rows) {
      const fields = row.line.split('\t').map(field=>field.trim());
      if (row===rows[0] && fields.length===2 && /^(?:招聘岗位|岗位名称|岗位)$/.test(fields[0]) &&
        /^(?:投递链接|网址|链接|招聘链接)$/.test(fields[1])) continue;
      const [title, address] = fields;
      if (fields.length!==2 || !title || title.length>240 || address.length>1800 ||
        !/^https?:\/\//i.test(address) || !URL.canParse(address)) {
        invalidRows.push(row.number);
        continue;
      }
      const url = new URL(address);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) {
        invalidRows.push(row.number);
        continue;
      }
      leads.push({ title, url:url.href });
    }
    return { leads, invalidRows };
  }

  // Public reference projects. Skills describe the proposed exercise, not every feature of the repository.
  const PRACTICE_PROJECTS = [
    {
      id: 'petclinic', repo: 'spring-projects/spring-petclinic', license: 'Apache-2.0',
      skills: ['java','spring_boot','sql_rdbms','database_design','software_testing'], hours: 6, setup: 'JDK 与 Maven 或 Gradle',
      baseline: '按 README 启动应用，用样例数据打开宠物主人列表，再查看一条详情。',
      trace: '从主人详情请求追到控制器、数据查询和页面模板，画出请求与数据流。',
      change: '给主人列表增加一个可组合的查询条件，并补充查询结果和空列表用例。',
      proof: '提交前后请求示例、测试结果及一张数据流图。',
      question: '查询条件增加后，如何验证旧行为仍然可用，哪些字段值得加索引？',
    },
    {
      id: 'fastapi', repo: 'fastapi/full-stack-fastapi-template', license: 'MIT',
      skills: ['python','api_design','sql_rdbms','database_design','linux_deploy','web_frontend','software_testing'], hours: 8, setup: 'Docker Compose',
      baseline: '依照 README 启动开发环境，在 API 文档中走通现有 Items 的创建和读取。',
      trace: '梳理 Items 路由、数据模型、数据库会话和前端调用的位置。',
      change: '给 Items 查询加分页边界校验和空结果用例，或在前端补充翻页和加载失败状态。',
      proof: '保存改动前后请求、分页边界测试及一段演示录像。',
      question: '翻页结果如何保持稳定排序？客户端怎样区分空结果和请求失败？',
    },
    {
      id: 'sqlmodel', repo: 'fastapi/sqlmodel', license: 'MIT',
      skills: ['python','sql_rdbms','database_design','software_testing'], hours: 3, setup: 'Python 与 SQLite',
      baseline: '运行文档里的入门 CRUD 示例，确认本地 SQLite 能完成一次写入和查询。',
      trace: '标出模型定义、会话与查询结果分别由哪一层负责。',
      change: '用公开样例或自造数据加一张关联表，覆盖无关联记录和重复数据场景。',
      proof: '保存表结构图、两组查询结果和可重复运行的测试。',
      question: '为什么把数据校验放在当前层？会话和事务的生命周期如何选？',
    },
    {
      id: 'react', repo: 'mdn/todo-react', license: 'MPL-2.0',
      skills: ['javascript','web_frontend','software_testing'], hours: 3, setup: 'Node.js 与浏览器',
      baseline: '按 README 安装依赖并打开待办页面，验证新增、编辑和筛选。',
      trace: '从表单事件追到列表状态和筛选结果，整理组件职责。',
      change: '增加本地持久化，补充页面刷新、空列表及无效存储内容的恢复用例。',
      proof: '保留可操作演示、刷新前后截图和边界用例结果。',
      question: '为什么把状态放在当前组件？恢复损坏状态时如何避免覆盖有效数据？',
    },
    {
      id: 'playwright', repo: 'microsoft/playwright-examples', license: 'MIT',
      skills: ['javascript','web_frontend','software_testing'], hours: 3, setup: 'Node.js 与 Playwright 浏览器',
      baseline: '选择仓库中一个示例，按官方说明运行单个已有测试并查看报告。',
      trace: '定位测试配置、页面操作、断言和失败产物。',
      change: '给自己可控制的演示页面增加一条用户流程和一条边界用例。',
      proof: '提交用例、一次通过的报告，以及演示页面故意出错时的失败记录。',
      question: '这个断言能捕捉哪类回归？如何降低测试偶发失败？',
    },
    {
      id: 'pandas', repo: 'pandas-dev/pandas', license: 'BSD-3-Clause',
      skills: ['python','data_analysis','statistics'], hours: 3, setup: 'Python 与 pandas',
      baseline: '使用发布版 pandas 运行官方入门示例，读取、聚合并导出样例 CSV。',
      trace: '写清数据字段、缺失值处理、分组口径及输出格式。',
      change: '给数据分析流程增加去重、缺失值处理和一项分组指标，并对照两种处理策略。',
      proof: '保留可重复运行的脚本、数据字典和前后对照表。',
      question: '为什么选这个缺失值策略？分组结果受哪些数据质量问题影响？',
    },
    {
      id: 'scikit', repo: 'scikit-learn/scikit-learn', license: 'BSD-3-Clause',
      skills: ['python','ml_basics','statistics','data_analysis','experiment_design'], hours: 4, setup: 'Python 与 scikit-learn',
      baseline: '使用发布版 scikit-learn 复现官方分类示例，保存训练／测试分割方式和评估输出。',
      trace: '串起预处理、训练、预测与评估，说明哪些步骤仅使用训练数据。',
      change: '用同一份数据和随机种子比较两种简单模型，并记录分类错误的典型样例。',
      proof: '保留环境和数据说明、混淆矩阵以及误判分析。',
      question: '如何发现数据泄漏？在类别不平衡时为什么选择当前评价指标？',
    },
    {
      id: 'zephyr', repo: 'zephyrproject-rtos/zephyr', license: 'Apache-2.0',
      skills: ['embedded_c','rtos','software_testing'], hours: 5, setup: 'Zephyr SDK、west 与 QEMU',
      baseline: '按官方入门文档配置 SDK，使用支持的 QEMU 目标运行入门样例。',
      trace: '找出入口、线程配置、事件传递和日志输出的位置。',
      change: '实现周期任务与消息队列，设置超时用例，并记录仿真下的任务行为。',
      proof: '提交仿真目标、运行日志、关键配置和队列时序图。',
      question: '队列满时采取了什么措施？仿真和硬件环境有哪些需要分别验证的行为？',
    },
    {
      id: 'stm32', repo: 'STMicroelectronics/STM32CubeF4', license: '子组件各自授权',
      skills: ['embedded_c','mcu','software_testing'], hours: 5, hardware: true, setup: '匹配的 STM32F4 开发板与调试工具',
      baseline: '核对板型、子模块和目标组件许可，烧录对应板型的 GPIO 或 UART 示例。',
      trace: '理清初始化、引脚映射、中断或串口接收与数据输出之间的关系。',
      change: '加入串口命令和异常输入处理，验证正常、超长和非法输入场景。',
      proof: '提交板型及接线说明、串口日志或录屏，以及实测用例。',
      question: '出现接收丢失时，如何区分时钟、缓冲区和中断处理问题？',
    },
  ];
  const PRACTICE_MODES = {
    review: { label: '只读代码', steps: ['选定文档版本并核对许可。', '沿入口追踪核心流程，记下输入、输出和一个边界条件。', '记录读码结论与待验证项。'] },
    smoke: { label: '最小跑通', steps: ['记录环境和仓库版本。', '走通一条核心流程，保存实际输入、输出和启动记录。', '记录一个失败场景及排查过程。'] },
    full: { label: '本地改造', steps: ['走通原始流程并保存复现记录。', '完成一项与岗位技能相关的改造。', '运行验证用例，记录改造前后差异。'] },
  };
  const PRACTICE_FOCUS = {
    backend: { label: '后端与数据库', ids: ['petclinic','fastapi','sqlmodel'] },
    frontend: { label: '前端交互', ids: ['fastapi','react'] },
    testing: { label: '测试与质量', ids: ['playwright'] },
    data: { label: '数据与机器学习', ids: ['pandas','scikit'] },
    firmware: { label: '嵌入式与固件', ids: ['zephyr','stm32'] },
  };
  function jobPracticePlan(req, profile, options = {}) {
    if (req.kind !== 'job' || profile.personalized === false) return null;
    const hours = [2,4,8,16].includes(options.hours) ? options.hours
      : ([2,4,8,16].find(value => value >= profile.weeklyHours) || 16);
    const mode = Object.hasOwn(PRACTICE_MODES, options.mode) ? options.mode : 'smoke';
    const focus = Object.hasOwn(PRACTICE_FOCUS, options.focus) ? options.focus : 'any';
    const preferredIds = PRACTICE_FOCUS[focus]?.ids || [];
    const requirements = jobRequirementsOf(req);
    const strengths = skillStatusMap(profile);
    const weight = { required: 3, preferred: 2, contextual: 1 };
    const candidates = PRACTICE_PROJECTS.filter(project => !project.hardware || options.hardware || mode === 'review')
      .map(project => {
        const matches = requirements.filter(requirement => project.skills.includes(requirement.skillId))
          .map(requirement => ({ ...requirement, name: skillName(requirement.skillId), status: STATUS_MAP[strengths.get(requirement.skillId) || 'not_learned'] }))
          .sort((a,b)=>weight[b.importance]-weight[a.importance]);
        const relevance = matches.reduce((sum, skill) => sum + weight[skill.importance], 0);
        const practice = matches.filter(skill => skill.status !== 'VERIFIED').length;
        const estimatedHours = mode === 'review' ? 2 : project.hours + (mode === 'full' ? 4 : 0);
        return { ...project, matches, relevance, practice, estimatedHours, withinBudget: estimatedHours <= hours,
          preferred: preferredIds.includes(project.id),
          url: 'https://github.com/' + project.repo };
      }).filter(project => project.relevance > 0)
      .sort((a,b)=>Number(b.withinBudget)-Number(a.withinBudget)||b.relevance-a.relevance||
        b.practice-a.practice||Number(b.preferred)-Number(a.preferred)||a.estimatedHours-b.estimatedHours||a.id.localeCompare(b.id));
    const projects = candidates.slice(0,3);
    const selected = projects.find(project => project.id === options.projectId) || projects[0] || null;
    const evidenceSkills = new Set(selected ? selected.matches.map(skill => skill.skillId) : requirements.map(skill => skill.skillId));
    const evidenceIds = new Set(profile.evidences.filter(item => item.skillIds.some(id => evidenceSkills.has(id))).map(item => item.id));
    const evidence = buildGroundedBullets(profile, req.id).filter(item => evidenceIds.has(item.evidenceId)).slice(0,3);
    return { hours, mode, focus, steps: PRACTICE_MODES[mode].steps, projects, selected, evidence, requirementCount: requirements.length };
  }

  function inspectPracticePaths(paths) {
    const groups = [
      ['运行说明', /^(?:readme|getting[_-]started)(?:\.[a-z0-9]+)?$/i],
      ['依赖与构建', /^(?:package\.json|pyproject\.toml|requirements(?:-[\w-]+)?\.txt|pom\.xml|build\.gradle(?:\.kts)?|cmakelists\.txt|cargo\.toml|go\.mod)$/i],
      ['入口候选', /^(?:index\.html|(?:main|app|server|index)\.(?:c|cc|cpp|py|go|rs|[cm]?js|jsx|ts|tsx)|\w+application\.java)$/i],
      ['路由与数据候选', /(?:^|\/)(?:api|routes|controllers|repositories|models|migrations)\/|(?:^|\/)(?:router|routes|schema|model|database)\.[a-z0-9]+$/i],
      ['验证与运行环境', /(?:^|\/)(?:tests?|__tests__|specs?|\.github\/workflows)\/|(?:^|\/)(?:dockerfile|(?:docker-)?compose\.ya?ml|.+[._](?:test|spec)\.[a-z0-9]+)$/i],
    ];
    const candidates=[];
    for(const rawPath of paths){
      const [, ...segments] = rawPath.split('/');
      if(!segments.length || segments.some(part => !part || /[\r\n]/.test(part) ||
        /^(?:\.|node_modules$|dist$|build$|target$|vendor$|__pycache__$)/i.test(part) && part!=='.github')) continue;
      const path = segments.join('/');
      if(path.length<=240) candidates.push({path, name:segments.at(-1), depth:segments.length});
    }
    candidates.sort((a,b)=>a.depth-b.depth||a.path.localeCompare(b.path));
    return groups.map(([label,pattern],index)=>({
      label, files:[...new Set(candidates.filter(file=>pattern.test(index<3?file.name:file.path)).map(file=>file.path))].slice(0,5),
    })).filter(group=>group.files.length);
  }

  /* ---- 八维结构化字段精准匹配矩阵（第一层确定性对表：为前端透视与第二层千问大模型提供结构化事实） ---- */
  const FIELD_STATUS_META = {
    matched: { label: '匹配', icon: '✓', tone: 'green' },
    partial: { label: '待核/部分', icon: '◐', tone: 'amber' },
    mismatch: { label: '存在差距', icon: '✗', tone: 'red' },
    unknown: { label: '未披露', icon: '○', tone: 'muted' },
  };
  function fieldMatchOf(p, req, match) {
    const m = match || forwardMatch(p, [req]).all[0];
    const g = req.hardGate || {};
    const prefs = p.preferences || {};
    const type = jobTypeOf(req);
    const typeLabel = { campus: '校招应届', intern: '在校实习', social: '社招/全职', competition: '学科竞赛' }[type] || '待核验';
    const stMap = skillStatusMap(p);
    const reqMap = new Map(jobRequirementsOf(req).map(item => [item.skillId, item]));
    const decorateSkill = s => {
      const stateKey = stMap.get(s.skillId) || 'not_learned';
      const reqInfo = reqMap.get(s.skillId);
      return {
        skillId: s.skillId,
        name: skillName(s.skillId),
        weight: s.weight,
        state: stateKey,
        status: STATUS_MAP[stateKey],
        statusLabel: STATUS_LABEL[STATUS_MAP[stateKey]],
        importance: reqInfo?.importance || 'contextual',
        textSpan: reqInfo?.textSpan || null,
        isGeneric: GENERIC_SKILL_IDS.has(s.skillId),
      };
    };
    const allSkills = dedupeSkillsById(req.skills).map(decorateSkill);
    const coreSkills = allSkills.filter(s => !s.isGeneric)
      .sort((a, b) => ({ required: 0, preferred: 1, contextual: 2 }[a.importance] - { required: 0, preferred: 1, contextual: 2 }[b.importance]) || b.weight - a.weight);
    const softSkills = allSkills.filter(s => s.isGeneric);
    const evidencedCore = coreSkills.filter(s => s.state === 'evidenced');
    const learnedCore = coreSkills.filter(s => s.state === 'learned_unverified');
    const missingCore = coreSkills.filter(s => s.state === 'not_learned');
    const coveredSoft = softSkills.filter(s => s.state !== 'not_learned');

    // 1. 学历门槛
    const degreeStatus = g.degreeUnrestricted ? 'matched'
      : DEGREE_LABEL[g.minDegree] ? (p.degree == null ? 'partial' : (DEGREE_RANK[p.degree] >= DEGREE_RANK[g.minDegree] ? 'matched' : 'mismatch'))
      : 'unknown';
    const degreeField = {
      key: 'degree', label: '学历门槛', status: degreeStatus,
      jobValue: g.degreeUnrestricted ? '学历不限' : DEGREE_LABEL[g.minDegree] ? DEGREE_LABEL[g.minDegree] + '及以上' : req.degree || '原文未明示',
      profileValue: DEGREE_LABEL[p.degree] || '档案待确认学历',
    };

    // 2. 招聘类型与届别
    const gYears = (g.graduationYears || []).map(Number);
    const prefTypes = prefs.jobTypes || [];
    let idStatus = 'partial';
    if (gYears.length && p.graduationYear != null && !gYears.includes(p.graduationYear)) idStatus = 'mismatch';
    else if (type === 'social' && p.graduationYear != null && p.graduationYear >= 2027) idStatus = 'mismatch';
    else if (prefTypes.length && type !== 'competition' && !prefTypes.includes(type)) idStatus = 'partial';
    else if (gYears.length && p.graduationYear != null) idStatus = 'matched';
    else if (type === 'intern' && p.graduationYear != null && p.graduationYear >= 2026) idStatus = 'matched';
    const identityField = {
      key: 'identity', label: '类型与届别', status: idStatus,
      jobValue: typeLabel + (gYears.length ? ' · ' + gYears.map(y => y + '届').join('/') : ''),
      profileValue: (p.graduationYear ? p.graduationYear + '届' : '届别待填')
        + (prefTypes.length ? ' · 倾向' + prefTypes.map(k => ({ campus: '校招', intern: '实习', social: '社招' }[k] || k)).join('/') : ''),
    };

    // 3. 方向与专业对口
    const family = jobFamilyOf(req);
    const dir = CAREER_DIRECTIONS.find(d => d.id === family?.directionId) || null;
    const ma = m?.majorAlignment || majorAlignmentOf(p, req);
    const dirStatus = dir && prefs.excludedDirectionIds?.includes(dir.id) ? 'mismatch'
      : (dir && (prefs.primaryDirectionId === dir.id || prefs.secondaryDirectionIds?.includes(dir.id))) || ma.level === '对口' ? 'matched'
      : ma.level === '相关' ? 'partial'
      : ma.level === '跨专业' ? 'mismatch' : 'unknown';
    const directionField = {
      key: 'direction', label: '方向与专业', status: dirStatus,
      jobValue: family ? (dir ? dir.name + ' · ' : '') + family.name : req.category || '综合方向',
      profileValue: (p.majorRaw || (p.major ? { cs: '计算机类', mat_mech: '材料机械类', econ: '经管类', chinese: '人文类' }[p.major] : '专业待填')) + '（' + ma.level + '）',
    };

    // 4. 工作城市与远程
    const locs = req.locations || [];
    const prefCities = prefs.cities || [];
    const locStatus = prefCities.length
      ? (req.remote || locs.some(c => prefCities.includes(c)) ? 'matched' : locs.length ? 'mismatch' : 'unknown')
      : (locs.length || req.remote ? 'matched' : 'unknown');
    const locationField = {
      key: 'location', label: '城市与办公', status: locStatus,
      jobValue: (locs.length ? locs.slice(0, 4).join(' / ') : '地点未明示') + (req.remote ? ' · 可远程' : ''),
      profileValue: prefCities.length ? '意向 ' + prefCities.slice(0, 4).join(' / ') : '城市不限',
    };

    // 5. 核心硬技能
    const coreCovered = evidencedCore.length + learnedCore.length;
    const coreStatus = !coreSkills.length
      ? (coveredSoft.length ? 'matched' : 'partial')
      : (missingCore.length === 0 || coreCovered / coreSkills.length >= 0.65) ? 'matched'
      : coreCovered > 0 ? 'partial' : 'mismatch';
    const coreField = {
      key: 'coreSkills', label: '核心硬技能', status: coreStatus,
      jobValue: coreSkills.length
        ? coreSkills.slice(0, 4).map(s => s.name).join('、') + (coreSkills.length > 4 ? ' 等' + coreSkills.length + '项' : '')
        : '侧重通用沟通与执行素养',
      profileValue: coreSkills.length
        ? `已证 ${evidencedCore.length} · 已学 ${learnedCore.length} · 缺口 ${missingCore.length}`
        : `通用素养覆盖 ${coveredSoft.length}/${softSkills.length}`,
    };

    // 6. 项目与实习成果支撑（真实项目/竞赛/科研/实习为主，课设仅作冷启动兜底）
    const reqSkillSet = new Set((req.skills || []).map(s => s.skillId));
    const linkedEv = (p.evidences || []).filter(ev => verificationOf(ev) !== 'rejected' && (ev.skillIds || []).some(id => reqSkillSet.has(id)));
    const hardcoreLinked = linkedEv.filter(ev => evidenceKindOf(ev) !== 'coursework');
    const confirmedHardcore = hardcoreLinked.filter(hasVerifiedEvidence);
    const courseworkLinked = linkedEv.filter(ev => evidenceKindOf(ev) === 'coursework');
    const confirmedCoursework = courseworkLinked.filter(hasVerifiedEvidence);
    const isColdStartProfile = !hasHardcoreExperience(p);
    const evStatus = confirmedHardcore.length > 0 || (isColdStartProfile && type === 'intern' && confirmedCoursework.length > 0)
      ? 'matched'
      : (hardcoreLinked.length > 0 || courseworkLinked.length > 0) ? 'partial' : 'mismatch';
    const evidenceField = {
      key: 'evidence', label: '成果与作品', status: evStatus,
      jobValue: req.bonusEvidenceTypes?.length ? req.bonusEvidenceTypes.slice(0, 2).join(' / ') : (type === 'intern' ? '课程设计 / 自研项目 / 竞赛或实习交付' : '自研项目 / 学科竞赛 / 实习交付物'),
      profileValue: hardcoreLinked.length
        ? `关联 ${hardcoreLinked.length} 段实战经历（已核验 ${confirmedHardcore.length} 段）`
        : courseworkLinked.length
          ? (!isColdStartProfile
            ? `仅关联 ${courseworkLinked.length} 段课设/作业（权重较低，建议补实战项目）`
            : `已接入 ${courseworkLinked.length} 项课程设计/课设支撑（零项目阶段核心依据${courseworkLinked.some(e => e.hasPortfolio || e.artifactUrl) ? ' · 含作品材料' : ''}）`)
          : isColdStartProfile && learnedCore.length
            ? `已有 ${learnedCore.length} 项相关课程基础，可将对应课程设计/实验接入档案提升匹配`
            : '暂无直接关联实战成果（建议先接入课程设计，或通过 B站体系课+自研项目补齐）',
    };

    // 7. 实习排期与时间预算（含多线发展时间冲突检测）
    const terms = jobTermsOf(req);
    const schedSpan = req.internshipPeriod || terms.internshipSchedule?.[0]?.sourceSpan?.slice(0, 38) || null;
    const daysMatch = (schedSpan || req.jdText || '').match(/(?:每周(?:出勤|实习|到岗)?|一周|出勤|工作)?\s*([1-6])(?:\s*[-~～至到]\s*([1-6]))?\s*天/);
    const reqDays = daysMatch ? Number(daysMatch[2] || daysMatch[1]) : null;
    const nonJobPaths = (p.intendedPaths || []).filter(path => !/就业|求职/.test(path));
    const highAttendance = reqDays != null && reqDays >= 4;
    const lowHoursConflict = reqDays != null && reqDays >= 3 && (p.weeklyHours || 8) < reqDays * 4;
    const multiPathConflict = nonJobPaths.length >= 1 && highAttendance && (p.weeklyHours || 8) < 20;
    const schedStatus = type !== 'intern' ? 'matched'
      : (multiPathConflict || (highAttendance && (p.weeklyHours || 8) < 12 && !p.internWindow)) ? 'mismatch'
      : lowHoursConflict ? 'partial'
      : schedSpan ? (p.internWindow ? 'matched' : 'partial')
      : (p.internWindow ? 'partial' : 'unknown');
    const schedWarn = multiPathConflict
      ? ` · 与多线目标(${nonJobPaths.join('/')})存在高出勤(${reqDays}天/周)时间冲突`
      : lowHoursConflict ? ` · 学时偏紧(建议 ≥${reqDays * 4}h/周)` : '';
    const scheduleField = {
      key: 'schedule', label: '排期与投入', status: schedStatus,
      jobValue: schedSpan || (type === 'intern' ? '出勤与实习周期未明示' : '按校招批次全职到岗'),
      profileValue: (p.internWindow ? p.internWindow + '可实习 · ' : '') + `每周可投入 ${p.weeklyHours || 8}h` + schedWarn,
    };

    // 8. 薪资与待遇保障
    const monthly = salaryMonthlyOf(req);
    const benefitTags = Object.entries(terms).filter(([k, q]) => k !== 'internshipSchedule' && q.length).map(([k]) => JOB_TERM_LABELS[k]);
    const compStatus = prefs.salaryMin > 0
      ? (monthly == null ? 'unknown' : monthly >= prefs.salaryMin ? 'matched' : 'mismatch')
      : (req.salary || benefitTags.length ? 'matched' : 'unknown');
    const compensationField = {
      key: 'compensation', label: '薪资与福利', status: compStatus,
      jobValue: (req.salary ? salaryTextOf(req) + (monthly ? `（约${Math.round(monthly)}元/月）` : '') : '薪资未公开')
        + (benefitTags.length ? ' · ' + benefitTags.slice(0, 2).join('/') : ''),
      profileValue: prefs.salaryMin > 0 ? `期望 ≥ ${prefs.salaryMin} 元/月` : '未设薪资下限',
    };

    const fields = [degreeField, identityField, directionField, locationField, coreField, evidenceField, scheduleField, compensationField]
      .map(f => ({ ...f, ...FIELD_STATUS_META[f.status] }));
    const counts = { matched: 0, partial: 0, mismatch: 0, unknown: 0 };
    for (const f of fields) counts[f.status]++;
    const headlineParts = [`${counts.matched}/8 维匹配`];
    if (coreSkills.length) headlineParts.push(`硬技能 ${coreCovered}/${coreSkills.length}`);
    if (missingCore.length) headlineParts.push(`待补 ${missingCore.slice(0, 2).map(s => s.name).join('、')}`);
    else if (counts.mismatch === 0) headlineParts.push('无硬性冲突');
    return {
      fields,
      counts,
      coreSkills,
      softSkills,
      evidencedCore,
      learnedCore,
      missingCore,
      headline: headlineParts.join(' · '),
    };
  }

  /* ---- 实战经验情报精排引擎 (intel-rank-2.0：六维匹配 + MMR多样性重排 + 4槽位周报) ---- */
  const INTEL_RANK_VERSION = 'intel-rank-2.0';
  const INTEL_HALF_LIFE_DAYS = {
    camp_policy: 21,
    interview_exp: 45,
    offer_retro: 60,
    project_guide: 180,
    pitfall: 180,
  };
  const SCHOOL_TIER_INDEX = {
    non_double_first_class: 1,
    double_first_class: 2,
    '211': 2,
    '985': 3,
    qingbei: 4,
    overseas: 3,
  };
  const TIER_ZH = {
    non_double_first_class: '双非院校',
    double_first_class: '双一流',
    '211': '211院校',
    '985': '985院校',
    qingbei: '顶尖名校',
    overseas: '海外高校',
  };
  const MAJOR_ZH = {
    cs: '计算机/软件类',
    mat_mech: '机械/自动化/硬件类',
    econ: '经管/商科类',
    chinese: '人文/新媒体类',
  };
  const START_ZH = {
    zero_internship: '零实习起步',
    has_internship: '已有实习进阶',
    has_project: '已有项目/竞赛',
    career_switch: '跨专业转型',
  };

  function inferSchoolTierFromName(schoolName) {
    const s = String(schoolName || '').trim();
    if (!s || /演示|未命名|待填/.test(s)) return 'unknown';
    if (/清北|清华|北京大学/.test(s)) return 'qingbei';
    if (/中外合[办作]|西交利物浦|西浦|宁波诺丁汉|宁诺|香港中文大学[（(]深圳|港中深|昆山杜克|上海纽约|北师港浸/.test(s)) return 'sino_foreign';
    if (/海本|海外本科|美本|英本|澳本|加本/.test(s)) return 'overseas';
    if (/\b985\b|复旦|上海交通|浙江大学|中国科学技术|南京大学|哈尔滨工业|西安交通|北京航空|同济|华中科技|东南大学|武汉大学|中山大学|厦门大学|北京理工|天津大学|南开|山东大学|四川大学|吉林大学|中南大学|大连理工|重庆大学|电子科技|西北工业|华南理工|中国农业|北京师范|华东师范|中国人民大学|中国海洋|中央民族|西北农林/.test(s)) {
      return '985';
    }
    if (/\b211\b|北京邮电|西安电子|南京航空|南京理工|武汉理工|上海财经|中央财经|中南财经|对外经济|西南财经|华中师范|东北师范|陕西师范|西南交通|北京交通|河海|江南大学|东华|苏州大学|暨南|华北电力|中国矿业|中国石油|中国地质|合肥工业|福州大学|郑州大学|云南大学|新疆大学|上海大学|北京工业|北京科技|北京化工|中国传媒|北京外国语|上海外国语/.test(s)) {
      return '211';
    }
    if (/双一流|南方科技|上海科技|中国科学院大学|南京邮电|南京信息工程|杭州电子.*双一流|宁波大学|湘潭大学|山西大学|河南大学/.test(s)) {
      return 'double_first_class';
    }
    return 'non_double_first_class';
  }

  function peerBaselineOfProfile(p = {}) {
    const pctVal = rankPercent(p);
    const rankBucket = pctVal == null ? 'unknown'
      : pctVal <= 10 ? 'top10%'
      : pctVal <= 30 ? '10%-30%' : '>30%';
    const hasIntern = (p.evidences || []).some(e => canonicalEvidenceType(e) === '实习' && verificationOf(e) !== 'rejected');
    const startingState = hasIntern ? 'has_internship'
      : hasHardcoreExperience(p) ? 'has_project' : 'zero_internship';
    return {
      schoolTier: inferSchoolTierFromName(p.school || p.schoolLabel || ''),
      majorFamily: p.major || 'unknown',
      rankBucket,
      startingState,
    };
  }

  function jaccardSet(arrA, arrB) {
    if (!arrA?.length || !arrB?.length) return 0;
    const setA = new Set(arrA);
    let inter = 0;
    const union = new Set(arrA);
    for (const x of arrB) {
      if (setA.has(x)) inter++;
      union.add(x);
    }
    return union.size ? inter / union.size : 0;
  }

  function experienceSimilarity(a, b) {
    const famSim = jaccardSet(a.familyIds, b.familyIds);
    const skillSim = jaccardSet(a.mappedSkillIds, b.mappedSkillIds);
    const orgSim = (a.targetOrgs?.length && b.targetOrgs?.some(o => a.targetOrgs.includes(o))) ? 1 : 0;
    const clusterSim = (a.corroborationCluster && a.corroborationCluster === b.corroborationCluster) ? 1 : 0;
    return Math.min(1, 0.40 * clusterSim + 0.35 * skillSim + 0.15 * famSim + 0.10 * orgSim);
  }

  function rankExperienceIntel(p = {}, paths = [], items = null, userPrefs = {}, nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    const sourceItems = Array.isArray(items) ? items : (D.experienceIntel?.items || []);
    const prefs = p.preferences || {};
    const dismissed = new Set(userPrefs?.dismissedIds || []);
    const readSet = new Set(userPrefs?.readIds || []);
    const tagWeights = userPrefs?.tagWeights || {};
    const userPeer = peerBaselineOfProfile(p);
    const excludedDirs = new Set(prefs.excludedDirectionIds || []);

    // Compute active skill gaps once for O(1) per-card lookup
    let targetIds = (p.targetReqIds || p.targetJobIds || []).filter(id => REQ_BY_ID.has(id));
    if (!targetIds.length && p.personalized !== false) {
      const topMatches = forwardMatch(p, allRequirements().filter(r => r.kind === 'job'), now).all
        .filter(m => m.eligibility.status !== 'FAIL' && !m.freshness.ended)
        .slice(0, 5);
      targetIds = topMatches.map(m => m.req.id);
    }
    const rawGaps = targetIds.length ? computeGaps(p, targetIds) : [];
    const gapWeightById = new Map();
    for (const g of rawGaps) {
      if (g.status === 'evidenced') continue;
      gapWeightById.set(g.skillId, g.status === 'learned_unverified' ? 0.75 : 1.0);
    }

    const month = now.getUTCMonth() + 1;
    const scored = [];

    for (const item of sourceItems) {
      if (!item || item.trustTier === 'C_CLUE' || item.livenessStatus === 'source_removed') continue;
      if ((item.guidanceScore ?? 0) < 0.55 && item.trustTier !== 'A_OFFICIAL') continue;
      if (dismissed.has(item.id)) continue;
      if (excludedDirs.size && item.directionIds?.length && item.directionIds.every(d => excludedDirs.has(d))) continue;

      const why = [];

      // 1. Path & Direction Match M_path ∈ [0, 1] (weight 25)
      const majorDirs = p.major ? CAREER_DIRECTIONS.filter(d => (d.domain || d.major) === p.major).map(d => d.id) : [];
      let mPath = 0.65;
      if (paths.length > 0) {
        const hitPaths = (item.paths || []).filter(k => paths.includes(k));
        if (hitPaths.length > 0) {
          mPath = 0.78;
          if (prefs.primaryDirectionId && item.directionIds?.includes(prefs.primaryDirectionId)) {
            mPath = 1.0;
            const dObj = CAREER_DIRECTIONS.find(d => d.id === prefs.primaryDirectionId);
            if (dObj) why.push('首选方向·' + dObj.name);
          } else if (prefs.secondaryDirectionIds?.some(id => item.directionIds?.includes(id))) {
            mPath = 0.92;
          } else if (hitPaths.includes('jiuye') && item.directionIds?.length && majorDirs.length) {
            if (item.directionIds.some(d => majorDirs.includes(d))) {
              mPath = 0.98;
              const hitDirObj = CAREER_DIRECTIONS.find(d => majorDirs.includes(d.id) && item.directionIds.includes(d.id));
              if (hitDirObj) why.push('专业对口方向·' + hitDirObj.name);
            } else {
              mPath = 0.25;
            }
          } else {
            const pLabels = { baoyan: '保研', kaoyan: '考研', liuxue: '留学', jiuye: '就业' };
            why.push('关注路径·' + hitPaths.map(k => pLabels[k] || k).join('/'));
          }
        } else {
          mPath = 0.18;
        }
      } else if (item.directionIds?.length && majorDirs.length) {
        mPath = item.directionIds.some(d => majorDirs.includes(d)) ? 0.88 : 0.45;
      }

      // 2. Peer Baseline Similarity M_peer ∈ [0, 1] (weight 22)
      const ab = item.authorBaseline || {};
      const peerParts = [];
      let peerMatchedDesc = [];
      if (ab.majorFamily && ab.majorFamily !== 'unknown' && userPeer.majorFamily !== 'unknown') {
        const sameMaj = ab.majorFamily === userPeer.majorFamily;
        peerParts.push(sameMaj ? 1.0 : (ab.startingState === 'career_switch' ? 0.80 : 0.25));
        if (sameMaj && MAJOR_ZH[ab.majorFamily]) peerMatchedDesc.push(MAJOR_ZH[ab.majorFamily]);
      }
      if (ab.schoolTier && ab.schoolTier !== 'unknown' && userPeer.schoolTier !== 'unknown') {
        const diff = Math.abs((SCHOOL_TIER_INDEX[ab.schoolTier] || 2) - (SCHOOL_TIER_INDEX[userPeer.schoolTier] || 2));
        const tierScore = diff === 0 ? 1.0 : diff === 1 ? 0.75 : 0.20;
        peerParts.push(tierScore);
        if (diff === 0 && TIER_ZH[ab.schoolTier]) peerMatchedDesc.push(TIER_ZH[ab.schoolTier]);
      }
      if (ab.startingState && ab.startingState !== 'unknown') {
        const sameStart = ab.startingState === userPeer.startingState;
        peerParts.push(sameStart ? 1.0 : (userPeer.startingState === 'zero_internship' && ab.startingState === 'has_project' ? 0.65 : 0.45));
        if (sameStart && START_ZH[ab.startingState]) peerMatchedDesc.push(START_ZH[ab.startingState]);
      }
      if (ab.rankBucket && ab.rankBucket !== 'unknown' && userPeer.rankBucket !== 'unknown' && item.paths?.includes('baoyan')) {
        const sameRank = ab.rankBucket === userPeer.rankBucket;
        peerParts.push(sameRank ? 1.0 : 0.50);
        if (sameRank) peerMatchedDesc.push('排名' + ab.rankBucket);
      }
      const mPeer = peerParts.length ? peerParts.reduce((a, b) => a + b, 0) / peerParts.length : 0.58;
      if (peerMatchedDesc.length) {
        why.unshift('同起点·' + peerMatchedDesc.slice(0, 2).join('·'));
      }

      // 3. Skill & Evidence Gap Overlap M_gap ∈ [0, 1] (weight 20)
      let mGap = 0.50;
      if (item.mappedSkillIds?.length) {
        const hitGapSkills = item.mappedSkillIds.filter(id => gapWeightById.has(id));
        if (hitGapSkills.length > 0) {
          const sumW = hitGapSkills.reduce((s, id) => s + (gapWeightById.get(id) || 0), 0);
          mGap = Math.min(1.0, sumW / 1.4);
          why.push('补齐缺口·' + hitGapSkills.slice(0, 2).map(skillName).join('/'));
        } else {
          const statusMap = skillStatusMap(p);
          const knownOverlap = item.mappedSkillIds.filter(id => statusMap.get(id) && statusMap.get(id) !== 'not_learned');
          mGap = knownOverlap.length ? 0.62 : 0.25;
        }
      }

      // 4. Guidance Quality Q_guide ∈ [0, 1] (weight 15)
      const qGuide = clamp(Number(item.guidanceScore) || 0.7, 0, 1);
      if ((item.corroborationCount || 1) >= 3) {
        why.push(`多源印证·${item.corroborationCount}篇提及`);
      } else if (item.trustTier === 'A_OFFICIAL') {
        why.push('A级官方指南');
      }

      // 5. Time Decay F_time ∈ [0, 1] (weight 10)
      const pubMs = Date.parse(item.citation?.publishedAt || item.citation?.verifiedAt || '');
      const ageDays = Number.isFinite(pubMs) ? Math.max(0, (now.getTime() - pubMs) / 86400000) : 30;
      const halfLife = INTEL_HALF_LIFE_DAYS[item.category] || 60;
      const batchFactor = item.livenessStatus === 'archived_past_batch' ? 0.55 : 1.0;
      const fTime = Math.pow(2, -ageDays / halfLife) * batchFactor;

      // 6. Calendar Stage Resonance U_stage ∈ [0, 1] (weight 8)
      let uStage = 0.55;
      if ([2, 3, 4].includes(month) && (item.paths?.includes('jiuye') || item.paths?.includes('baoyan'))) uStage = 1.0;
      else if ([5, 6, 7].includes(month) && (item.paths?.includes('baoyan') || item.category === 'interview_exp')) uStage = 0.95;
      else if ([8, 9, 10].includes(month)) uStage = 1.0;
      else if ([11, 12, 1].includes(month) && (item.category === 'project_guide' || item.category === 'offer_retro' || item.category === 'interview_exp')) uStage = 0.92;

      // 7. Local Zero-Knowledge Feedback & Workload Fatigue
      let bPref = 0;
      bPref += Number(tagWeights['cat:' + item.category] || 0);
      bPref += Number(tagWeights['plat:' + item.platform] || 0);
      if (ab.schoolTier || ab.startingState) {
        bPref += Number(tagWeights[`peer:${ab.schoolTier || 'unknown'}:${ab.startingState || 'unknown'}`] || 0);
      }
      if (item.corroborationCluster) {
        bPref += Number(tagWeights['cluster:' + item.corroborationCluster] || 0);
      }
      for (const sid of item.mappedSkillIds || []) {
        bPref += Number(tagWeights['skill:' + sid] || 0);
      }
      bPref = clamp(bPref, -15, 12);

      let pFatigue = readSet.has(item.id) ? 8 : 0;
      if ((p.weeklyHours || 8) < 6 && (item.actionTask?.estimatedHours || 0) > 6) {
        pFatigue += 5;
      }

      const rawScore = clamp(
        25 * mPath + 22 * mPeer + 20 * mGap + 15 * qGuide + 10 * fTime + 8 * uStage + bPref - pFatigue,
        0,
        100
      );

      if (!why.length) {
        why.push(item.category === 'pitfall' ? '通用防坑保护' : '当季高频实操参考');
      }

      scored.push({
        ...item,
        score: Math.round(rawScore),
        rawScore: round2(rawScore),
        why: [...new Set(why)].slice(0, 4),
        factors: {
          path: round2(mPath),
          peer: round2(mPeer),
          gap: round2(mGap),
          quality: round2(qGuide),
          freshness: round2(fTime),
          stage: round2(uStage),
          prefBonus: round2(bPref),
          fatiguePenalty: round2(pFatigue),
        },
      });
    }

    scored.sort((a, b) => b.rawScore - a.rawScore || a.id.localeCompare(b.id));

    // Stage 3: MMR Diversity Re-ranking on Top-30 candidates (lambda = 0.72)
    const lambda = 0.72;
    const pool = scored.slice(0, 30);
    const tail = scored.slice(30);
    const selected = [];
    while (pool.length > 0) {
      let bestIdx = 0;
      let bestMmr = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        const maxSim = selected.length
          ? Math.max(...selected.map(sel => experienceSimilarity(cand, sel)))
          : 0;
        const mmr = lambda * (cand.rawScore / 100) - (1 - lambda) * maxSim;
        if (mmr > bestMmr) {
          bestMmr = mmr;
          bestIdx = i;
        }
      }
      const [picked] = pool.splice(bestIdx, 1);
      picked.mmrScore = round3(bestMmr);
      selected.push(picked);
    }
    return [...selected, ...tail];
  }

  function buildWeeklyDigest(rankedItems = [], paths = []) {
    const chosen = [];
    const usedIds = new Set();
    const take = (slotKey, slotLabel, pred) => {
      const hit = rankedItems.find(it => !usedIds.has(it.id) && pred(it));
      if (hit) {
        usedIds.add(hit.id);
        chosen.push({ slotKey, slotLabel, item: hit });
      }
    };
    take('policy_window', '窗口与官方指南', it => it.trustTier === 'A_OFFICIAL' || it.category === 'camp_policy');
    take('peer_breakthrough', '同起点破局复盘', it => (it.factors?.peer ?? 0) >= 0.7 && ['offer_retro', 'interview_exp'].includes(it.category));
    take('gap_playbook', '缺口实战与面经', it => (it.factors?.gap ?? 0) >= 0.55 || ['project_guide', 'interview_exp'].includes(it.category));
    take('pitfall_guard', paths.length > 1 ? '多线协同与避坑' : '求职升学避坑', it => it.category === 'pitfall' || !usedIds.has(it.id));

    for (const it of rankedItems) {
      if (chosen.length >= 4) break;
      if (!usedIds.has(it.id)) {
        usedIds.add(it.id);
        chosen.push({ slotKey: 'featured', slotLabel: '本周精选攻略', item: it });
      }
    }
    return chosen;
  }

  function experiencesForPath(pathKey, p = {}, items = null, userPrefs = {}, now = new Date()) {
    const ranked = rankExperienceIntel(p, [pathKey], items, userPrefs, now);
    return ranked.filter(it => it.paths?.includes(pathKey)).slice(0, 2);
  }

  function experiencesForJob(job, p = {}, items = null, userPrefs = {}, now = new Date()) {
    if (!job) return [];
    const family = jobFamilyOf(job);
    const jobSkillSet = new Set((job.skills || []).map(s => s.skillId));
    const orgName = String(job.org || job.orgLabel || '');
    const ranked = rankExperienceIntel(p, ['jiuye'], items, userPrefs, now);
    return ranked
      .filter(it => it.paths?.includes('jiuye'))
      .map(it => {
        let boost = 0;
        if (orgName && it.targetOrgs?.some(o => orgName.includes(o) || o.includes(orgName))) boost += 25;
        if (family && it.familyIds?.includes(family.id)) boost += 18;
        else if (family && it.directionIds?.includes(family.directionId)) boost += 10;
        const skHits = (it.mappedSkillIds || []).filter(id => jobSkillSet.has(id)).length;
        boost += skHits * 8;
        return { item: it, jobRelevance: boost + it.rawScore * 0.5 };
      })
      .filter(x => x.jobRelevance >= 35)
      .sort((a, b) => b.jobRelevance - a.jobRelevance)
      .slice(0, 3)
      .map(x => x.item);
  }

  const ABROAD_MATCH_VERSION = 'abroad-match-1.0';
  const CASE_SIM_VERSION = 'case-sim-1.0';
  const COURSE_PREREQ_TAGS = {
    math_calculus: /微积分|高等数学|数学分析|calculus|mathematical analysis/i,
    math_linear_algebra: /线性代数|高等代数|矩阵论|linear algebra/i,
    math_prob_stat: /概率|统计|计量经济学|probability|statistics|econometrics/i,
    prog_basic: /程序设计|编程|C语言|C\+\+|\b(?:python|java|programming)\b/i,
    cs_core: /数据结构|算法设计|操作系统|计算机网络|数据库原理|data structures|operating systems|computer networks|database systems/i,
    ee_control_core: /模拟电路|数字电路|信号与系统|自动控制|控制工程|单片机|嵌入式|control systems|circuits|embedded systems/i,
    econ_fin_core: /微观经济学|宏观经济学|金融学|公司金融|财务会计|财务管理|会计学|microeconomics|macroeconomics|finance|accounting/i,
    research_methods: /社会调查|研究方法|学术写作|实验设计|统计建模|市场调查|文献检索|research methods|experimental design/i,
  };
  const knownAbroadNumber = value => typeof value === 'number' && Number.isFinite(value);
  const clampAbroad = value => Math.min(1, Math.max(0, value));
  const positiveAdmission = item => ['offer', 'conditional_offer'].includes(item.outcome);
  function normalizeAbroadMajor(majorStr) {
    if (!majorStr) return null;
    if (['cs', 'mat_mech', 'econ', 'chinese', 'other'].includes(majorStr)) return majorStr;
    return majorOf(majorStr) || 'other';
  }
  function resolveAbroadTier(profile = {}, abroadPrefs = {}) {
    if (abroadPrefs?.schoolTier) return abroadPrefs.schoolTier;
    if (profile?.schoolTier) return profile.schoolTier;
    const inferred = inferSchoolTierFromName(profile?.school || profile?.schoolLabel || '');
    return inferred !== 'unknown' ? inferred : undefined;
  }

  function auditPrerequisites(courses, program) {
    const rows = (program.prereqCourseTags || []).map(tag => ({ tag, completed: [], inProgress: [] }));
    for (const record of courses || []) {
      const course = typeof record === 'string' ? { id: record, status: 'completed' } : record;
      const name = course.name || COURSE_BY_ID.get(course.id)?.name || '';
      const status = ['已通过', '已修', 'completed'].includes(course.status) ? 'completed'
        : ['在修', 'in_progress'].includes(course.status) ? 'inProgress' : null;
      if (!status) continue;
      for (const row of rows) {
        if (COURSE_PREREQ_TAGS[row.tag]?.test(name) && !row[status].includes(name)) row[status].push(name);
      }
    }
    const missing = rows.filter(row => !row.completed.length && !row.inProgress.length).map(row => row.tag);
    const pending = rows.filter(row => !row.completed.length && row.inProgress.length).map(row => row.tag);
    const coverage = rows.length ? (rows.length - missing.length - 0.5 * pending.length) / rows.length : 1;
    return { rows, missing, pending, coverage };
  }

  function evaluateAbroadProgram(profile = {}, abroadPrefs = {}, program, now = new Date(), cases = []) {
    const tier = resolveAbroadTier(profile, abroadPrefs);
    const gpa = abroadPrefs.gpa ?? profile.gpa;
    const normalizedMajor = normalizeAbroadMajor(profile.major);
    const rules = program.tierGpaRules || {};
    const minimum = tier && tier !== 'unknown' && knownAbroadNumber(rules[tier]) ? rules[tier] : null;
    const courseRecords = profile.courses || [];
    const listedIds = new Set(courseRecords.map(course => course.id));
    const courses = [...courseRecords, ...(profile.completedCourseIds || []).filter(id => !listedIds.has(id))];
    const audit = auditPrerequisites(courses, program);
    const isAligned = Boolean(normalizedMajor && (program.allowedMajors || []).includes(normalizedMajor));
    const lang = abroadPrefs.language || {};
    const verifiedLanguage = (knownAbroadNumber(program.ieltsOverall) && lang.ieltsOverall >= program.ieltsOverall &&
      (!knownAbroadNumber(program.ieltsSubMin) || lang.ieltsSubMin >= program.ieltsSubMin)) ||
      (knownAbroadNumber(program.toeflOverall) && lang.toeflOverall >= program.toeflOverall) ||
      (program.langPolicy === 'cet6_accepted' && lang.cet6Accepted === true);
    const gradTest = abroadPrefs.meetsGreGmat === true || program.greGmatPolicy !== 'required';
    const blocked = [];
    const conditions = [];
    const unknown = [];
    if (tier && (rules.blockedTiers || []).includes(tier)) blocked.push('院校认可名单不覆盖当前本科梯度');
    if (program.prereqMode === 'strict_ects' && audit.coverage < 0.5 &&
        normalizedMajor && program.allowedMajors?.length && !isAligned) blocked.push('课表缺少严格先修项目的核心课程');
    if (minimum !== null && knownAbroadNumber(gpa) && gpa < minimum - 3) blocked.push('均分低于当前院校梯度要求的缓冲线');
    if (minimum !== null && knownAbroadNumber(gpa) && gpa < minimum) conditions.push('均分需达到 ' + minimum);
    if (!tier || tier === 'unknown' || !knownAbroadNumber(gpa) || minimum === null) unknown.push('院校梯度或适用均分要求待核实');
    if (audit.coverage < 1 && program.prereqMode !== 'cross_major_friendly') conditions.push('先修课待补齐或核实');
    if (program.prereqMode === 'strict_ects') conditions.push('严格 ECTS 学分须按官网逐项复核');
    if (!verifiedLanguage) conditions.push(program.langPolicy === 'conditional_allowed'
      ? '项目允许先申请，语言条件仍待完成' : '递交前核实并补齐语言要求');
    if (!gradTest) conditions.push('GRE 或 GMAT 要求待满足');
    if (program.greGmatPolicy === 'unknown') conditions.push('GRE 或 GMAT 要求待核实');
    const season = abroadRoundStatus(program, now);
    if (season.status === 'closed' || season.status === 'archived') blocked.push('项目当前申请季已关闭或归档');
    const status = blocked.length ? 'FAIL' : unknown.length ? 'UNKNOWN' : conditions.length ? 'CONDITIONAL' : 'PASS';
    const samples = cases.filter(item => item.programId === program.id && item.undergradTier === tier &&
      positiveAdmission(item) && knownAbroadNumber(item.gpaPercent)).map(item => item.gpaPercent).sort((a, b) => a - b);
    const mid = Math.floor(samples.length / 2);
    const median = samples.length ? (samples[mid] + samples[Math.floor((samples.length - 1) / 2)]) / 2 : null;
    let gpaFactor = 0.5;
    if (minimum !== null && knownAbroadNumber(gpa)) {
      if (gpa < minimum) gpaFactor = clampAbroad(0.55 - 0.12 * (minimum - gpa));
      else if (median === null) gpaFactor = 0.55;
      else if (median > minimum && gpa < median) gpaFactor = 0.55 + 0.25 * (gpa - minimum) / (median - minimum);
      else gpaFactor = Math.min(1, 0.8 + 0.1 * Math.max(0, gpa - median));
    }
    const factors = {
      list: (rules.blockedTiers || []).includes(tier) ? 0 : minimum === null ? 0.5 : 1,
      gpa: gpaFactor, prereq: audit.coverage, lang: verifiedLanguage ? 1 : program.langPolicy === 'conditional_allowed' ? 0.5 : 0,
      gre: program.greGmatPolicy === 'unknown' ? 0.5 : gradTest ? 1 : 0, exp: hasHardcoreExperience(profile) ? 1 : 0.5,
      budget: knownAbroadNumber(abroadPrefs.budgetRmb) && knownAbroadNumber(program.estTotalRmbPerYear)
        ? Number(abroadPrefs.budgetRmb >= program.estTotalRmbPerYear) : 0.5,
      time: season.status === 'open' ? 1 : ['closed','archived'].includes(season.status) ? 0 : 0.5,
    };
    const weights = { list: 24, gpa: 24, prereq: 18, lang: 12, gre: 6, exp: 10, budget: 4, time: 2 };
    const score = Math.round(Object.keys(weights).reduce((sum, key) => sum + weights[key] * factors[key], 0));
    let band = 'reach';
    if (status === 'FAIL') band = 'blocked';
    else if (status === 'PASS' && median !== null && gpa >= Math.max(minimum, median + 1.5) &&
        factors.prereq >= 0.85 && factors.list >= 0.85) band = 'safety';
    else if (minimum !== null && gpa >= minimum && score >= 68 && status !== 'UNKNOWN') band = 'match';
    return { program, score, band, factors, audit, minimum, median, sampleCount: samples.length,
      eligibility: { status, reasons: [...blocked, ...unknown, ...conditions] } };
  }

  function matchAbroadPrograms(profile, prefs, programs, now = new Date(), cases = []) {
    const byProgram = new Map();
    for (const item of cases) {
      if (!byProgram.has(item.programId)) byProgram.set(item.programId, []);
      byProgram.get(item.programId).push(item);
    }
    return programs.map(program => evaluateAbroadProgram(profile, prefs, program, now, byProgram.get(program.id)))
      .sort((a, b) => Number(a.band === 'blocked') - Number(b.band === 'blocked') ||
        b.score - a.score || a.program.id.localeCompare(b.program.id));
  }

  function similarAbroadCases(profile = {}, cases = [], { programId, offerLimit = 3, cautionLimit = 2, minSimilarity = 0 } = {}) {
    const userTier = resolveAbroadTier(profile, {});
    const userMajor = normalizeAbroadMajor(profile.major);
    const pool = programId ? cases.filter(item => item.programId === programId) : cases;
    const ranked = pool.map(item => {
      const tier = userTier && userTier !== 'unknown' && item.undergradTier !== 'unknown'
        ? Number(userTier === item.undergradTier) : 0;
      const gpa = knownAbroadNumber(profile.gpa) && knownAbroadNumber(item.gpaPercent)
        ? Math.exp(-Math.abs(profile.gpa - item.gpaPercent) / 4) : 0;
      const major = userMajor && item.majorFamily !== 'other' ? Number(userMajor === item.majorFamily) : 0;
      const soft = item.highlights?.length && hasHardcoreExperience(profile) ? 1 : 0;
      return { ...item, similarity: Math.round(35 * tier + 30 * gpa + 25 * major + 10 * soft) };
    }).filter(item => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
    return { offers: ranked.filter(positiveAdmission).slice(0, offerLimit),
      cautions: ranked.filter(item => ['reject', 'waitlist'].includes(item.outcome)).slice(0, cautionLimit) };
  }

  function abroadRoundStatus(program, now = new Date()) {
    if (program.livenessStatus === 'archived') return { status:'archived', round:null };
    const today = now.toISOString().slice(0, 10);
    const rounds = (program.rounds || []).filter(round => /^\d{4}-\d{2}-\d{2}$/.test(round.deadline))
      .sort((left, right) => left.deadline.localeCompare(right.deadline));
    const upcoming = rounds.filter(round => round.deadline >= today);
    const open = upcoming.find(round => round.openDate && round.openDate <= today);
    const round = open || upcoming[0] || null;
    if (!round) return { status:rounds.length || program.livenessStatus === 'closed_season' ? 'closed' : 'unknown', round };
    return { status:open ? 'open' : round.openDate ? 'upcoming' : 'unconfirmed', round,
      daysRemaining:Math.round((Date.parse(round.deadline) - Date.parse(today)) / 86400000) };
  }

  function buildAbroadMilestones(program, now = new Date()) {
    const {status, round:nextRound} = abroadRoundStatus(program, now);
    if (status === 'closed' || status === 'archived') return [];
    const base = { source: 'abroad_deadline', programId: program.id, hours: 0 };
    const apply = {
      ...base, id: 'abroad_apply_' + program.id,
      title: program.titleZh + ' · 网申',
      detail: nextRound ? nextRound.round + ' · 官网截止日' : '申请截止日待向院校核实',
      deadline: nextRound?.deadline ?? null,
    };
    const requiresLanguageBeforeSubmission = program.langPolicy === 'required_at_submit' || program.langPolicy === 'cet6_accepted';
    const language = {
      ...base, id: 'abroad_language_' + program.id,
      title: program.titleZh + ' · 语言成绩',
      detail: requiresLanguageBeforeSubmission ? '递交前须备妥合格成绩，具体出分安排以考试机构为准'
        : program.langPolicy === 'conditional_allowed' ? '可先递交，语言条件的最晚提交日以录取通知为准'
          : '语言递交要求与截止日待向院校核实',
      deadline: requiresLanguageBeforeSubmission ? apply.deadline : null,
    };
    return [apply, language];
  }

  function buildAbroadOutline(profile, program) {
    const modules = (program.coreModules || []).filter(value => typeof value === 'string');
    const moduleSkills = new Map(modules.map(name => [name, new Set(extractSkillsFromText(name).map(skill => skill.skillId))]));
    const seen = new Set();
    const materials = [];
    for (const item of Array.isArray(profile.evidences) ? profile.evidences : []) {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !hasVerifiedEvidence(item)) continue;
      if (typeof item.title !== 'string' || !item.title.trim()) continue;
      seen.add(item.id);
      const skills = Array.isArray(item.skillIds) ? item.skillIds : [];
      const relatedModules = modules.filter(name => skills.some(id => moduleSkills.get(name).has(id)));
      const metrics = (Array.isArray(item.metrics) ? item.metrics : []).filter(metric =>
        metric?.verified === true && typeof metric.label === 'string' &&
        (knownAbroadNumber(metric.value) || (typeof metric.value === 'string' && metric.value.trim())));
      materials.push({ evidenceId: item.id, title: item.title, relatedModules,
        metrics: metrics.length ? metrics.map(metric => metric.label + '：' + metric.value) : ['[待补充实测数据]'] });
    }
    materials.sort((a,b) => b.relatedModules.length - a.relatedModules.length);
    const records = profile.courses || [];
    const listed = new Set(records.map(course => course.id));
    const audit = auditPrerequisites([...records, ...(profile.completedCourseIds || []).filter(id => !listed.has(id))], program);
    const verifiedCourses = [...new Set(audit.rows.flatMap(row => row.completed))];
    const lines = [
      '# SOP / PS 与 Academic CV 提纲', '', '目标项目：' + program.titleZh,
      '', '## SOP / PS', '1. 申请动机：[补充个人动机与目标]',
      '2. 课程准备：' + (verifiedCourses.join('、') || '[补充可核验课程]'),
      '3. 经历与项目关联：',
      ...materials.map(item => '- ' + item.title + '（evidenceId: ' + item.evidenceId + '）' +
        (item.relatedModules.length ? ' → ' + item.relatedModules.join('、') : '') + ' · ' + item.metrics.join('；')),
      ...(materials.length ? [] : ['- [补充可核验经历]']),
      '4. 学习计划：[结合官网课程说明补充]', '', '## Academic CV',
      ...materials.map(item => '- ' + item.title + '（evidenceId: ' + item.evidenceId + '） · ' + item.metrics.join('；')),
      ...(materials.length ? [] : ['- [补充可核验经历]']),
    ];
    return { programId: program.id, verifiedCourses, materials, markdown: lines.join('\n') + '\n' };
  }

  function buildAbroadComparison(matches, now = new Date()) {
    const ordered = [...matches].sort((a,b) => {
      const deadline = item => buildAbroadMilestones(item.program, now)[0]?.deadline || '9999';
      return Number(a.band === 'blocked') - Number(b.band === 'blocked') ||
        deadline(a).localeCompare(deadline(b)) || b.score - a.score || a.program.id.localeCompare(b.program.id);
    });
    return ordered.map(({program, eligibility, band}) => ({
      programId: program.id, title: program.titleZh, band, status: eligibility.status,
      nextDeadline: buildAbroadMilestones(program, now)[0]?.deadline ?? null,
      action: eligibility.reasons[0] || '核对官网本轮材料清单后安排递交',
    }));
  }

  window.CC = {
    ABROAD_MATCH_VERSION,
    CASE_SIM_VERSION,
    inferSchoolTierFromName,
    normalizeAbroadMajor,
    abroadRoundStatus,
    buildAbroadComparison,
    buildAbroadOutline,
    buildAbroadMilestones,
    COURSE_PREREQ_TAGS, auditPrerequisites, evaluateAbroadProgram, matchAbroadPrograms, similarAbroadCases,
    DATA: D, SKILL_BY_ID, COURSE_BY_ID, JOB_BY_ID, REQ_BY_ID, PLACEHOLDER, STATUS_LABEL,
    COMPETITIONS, SOURCES, SOURCE_PROVENANCE, allRequirements,
    sourcesByCategory: () => SOURCES.reduce((acc, s) => { const k = s.category || '其他'; (acc[k] = acc[k] || []).push(s); return acc; }, {}),
    normalizeSkill, extractSkillsFromText, dedupeSkillsById, skillStatusMap, reverseStatusOf, checkHardGate, evaluateEligibility, coverageOf,
    forwardMatch, compareMatches, rankWithMatchWeights, computeGaps, simulateGapImpact, analyzeTargets, topoSortCourses, buildUpgradePlan, matchCourseByText,
    roadmapTasksOf, reviewRoadmapEvidence,
    majorAlignmentOf, recommendTierOf, jobApplicationPlan, TIER_META, MAJOR_GROUP, salaryParse, salaryMonthlyOf, salaryTextOf, hasVerifiedEvidence,
    fieldMatchOf, GENERIC_SKILL_IDS, FIELD_STATUS_META,
    buildGroundedBullets, parseJdCore, extractJobTitle, extractGates, extractDeliverables, jobRequirementsOf, jobFactsOf, JD_FACT_LABELS,
    jobTermsOf, JOB_TERM_LABELS,
    makeImportedJob, setImportedJobs, parseJobLeads,
    jobTypeOf, sourceSnapshotOf, jobFreshness, postingIdentity, distinctPostings, jobFamilyOf, careerDirections, CAREER_DIRECTIONS, LEARNING_RESOURCES, buildEmploymentReview, buildDomainPack,
    employmentEvidenceMappings, employmentPilotResponse, PILOT_ANSWERS, projectEmploymentMatchProfile,
    jobPracticePlan, inspectPracticePaths, PRACTICE_MODES, PRACTICE_FOCUS,
    EVIDENCE_TYPE_WEIGHT, canonicalEvidenceType, evidenceKindOf, hasHardcoreExperience,
    SELF_STUDY_CATALOG, selfStudyFor, buildColdStartCourseworkGuide, extractHardGateObject,
    EMPLOYMENT_SCHEMA_VERSION, MATCH_VERSION, TAXONOMY_VERSION, MATCH_WEIGHTS, DEGREE_LABEL, ELIGIBILITY_LABEL, LINK_LABEL, STATUS_LABELS,
    INTEL_RANK_VERSION, peerBaselineOfProfile, rankExperienceIntel, buildWeeklyDigest, experiencesForPath, experiencesForJob,
    coursesOfMajor, skillName, courseName, rankPercent, pathPriority,
    djb2, snapshotHash, checkUpdate, majorOf, resolveCourseId, ccProfileFromState, gradYearFromGrade, PATH_MAP,
  };
})();
