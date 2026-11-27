import { EXPERIENCE_CHANNELS } from './_experience-channels.mjs';

const BASE_QUERY_SEEDS = [
  {
    seedId: 'seed_nc_backend_intern',
    channel: 'nowcoder',
    queryTemplate: 'site:nowcoder.com "{gradYear}届" (后端 OR Go OR Java) 实习 面经 复盘',
    paths: ['jiuye'],
    seasonMonths: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12],
    skillId: 'golang',
    adoptionScore: 0.78,
  },
  {
    seedId: 'seed_nc_ai_agent',
    channel: 'nowcoder',
    queryTemplate: 'site:nowcoder.com ("大模型" OR "Agent" OR "RAG") 实习 面经 追问',
    paths: ['jiuye'],
    seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    skillId: 'llm_app_dev',
    adoptionScore: 0.76,
  },
  {
    seedId: 'seed_nc_embedded_hw',
    channel: 'nowcoder',
    queryTemplate: 'site:nowcoder.com (嵌入式 OR STM32 OR 固件 OR 控制算法) 校招 实习 面经',
    paths: ['jiuye'],
    seasonMonths: [2, 3, 4, 7, 8, 9, 10, 11],
    skillId: 'embedded_c',
    adoptionScore: 0.74,
  },
  {
    seedId: 'seed_nc_pm_ops',
    channel: 'nowcoder',
    queryTemplate: 'site:nowcoder.com (产品经理 OR 内容运营 OR 数据分析) 实习 面经 复盘',
    paths: ['jiuye'],
    seasonMonths: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12],
    skillId: 'data_analysis',
    adoptionScore: 0.72,
  },
  {
    seedId: 'seed_zh_baoyan_edge',
    channel: 'zhihu',
    queryTemplate: 'site:zhuanlan.zhihu.com 保研 (双非 OR 边缘排名 OR 预推免 OR 夏令营) 经验 复盘',
    paths: ['baoyan'],
    seasonMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    skillId: null,
    adoptionScore: 0.75,
  },
  {
    seedId: 'seed_zh_kaoyan_plan',
    channel: 'zhihu',
    queryTemplate: 'site:zhuanlan.zhihu.com 考研 (择校 OR 408 OR 专业课复盘 OR 初试时间线) 上岸经验',
    paths: ['kaoyan'],
    seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    skillId: null,
    adoptionScore: 0.70,
  },
  {
    seedId: 'seed_xhs_spring_autumn',
    channel: 'xiaohongshu',
    queryTemplate: 'site:xiaohongshu.com/explore ("双非" OR "零实习") (春招 OR 秋招 OR 暑期实习) 上岸复盘 经验',
    paths: ['jiuye'],
    seasonMonths: [2, 3, 4, 5, 8, 9, 10, 11, 12],
    skillId: null,
    adoptionScore: 0.68,
  },
  {
    seedId: 'seed_xhs_liuxue_timeline',
    channel: 'xiaohongshu',
    queryTemplate: 'site:xiaohongshu.com/explore (港三新二 OR 英国G5 OR 留学DIY) 均分 时间线 申请复盘',
    paths: ['liuxue'],
    seasonMonths: [1, 2, 3, 6, 7, 8, 9, 10, 11, 12],
    skillId: null,
    adoptionScore: 0.66,
  },
  {
    seedId: 'seed_gh_baoyan_interview',
    channel: 'github_exp',
    queryTemplate: 'site:github.com (保研夏令营 OR 校招面经汇总 OR 计算机保研经验) README',
    paths: ['baoyan', 'jiuye'],
    seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    skillId: null,
    adoptionScore: 0.82,
  },
  {
    seedId: 'seed_bili_project_guide',
    channel: 'bilibili_edu',
    queryTemplate: 'site:bilibili.com/read (秋招复盘 OR 保研经验 OR 简历项目改造) 实战',
    paths: ['jiuye', 'baoyan'],
    seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    skillId: null,
    adoptionScore: 0.70,
  },
];

const SEASONAL_THEMES = {
  spring_intern: { months: [2, 3, 4], label: '暑期实习与春招冲刺', boostPaths: ['jiuye', 'baoyan'], keywords: ['暑期实习面经', '春招补录复盘', '夏令营联系导师'] },
  summer_camp: { months: [5, 6, 7], label: '夏令营考核与实习留用', boostPaths: ['baoyan', 'jiuye', 'liuxue'], keywords: ['夏令营机试面试', '实习转正答辩', '留学文书选校'] },
  autumn_peak: { months: [8, 9, 10], label: '秋招正式批·预推免·考研报名·Round1', boostPaths: ['jiuye', 'baoyan', 'kaoyan', 'liuxue'], keywords: ['秋招一面二面', '预推免九推捡漏', '考研择校报录比', '港新Round1申请'] },
  winter_prep: { months: [11, 12, 1], label: '秋招收官复盘·寒假日常实习·课设打磨', boostPaths: ['jiuye', 'kaoyan', 'baoyan'], keywords: ['秋招总结复盘', '日常实习冷启动', '考研冲刺复试', '课设升级开源项目'] },
};

export function defaultQuerySeeds() {
  return BASE_QUERY_SEEDS.map(s => ({ ...s }));
}

export function detectSeasonTheme(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  for (const [id, theme] of Object.entries(SEASONAL_THEMES)) {
    if (theme.months.includes(month)) return { id, month, ...theme };
  }
  return { id: 'winter_prep', month, ...SEASONAL_THEMES.winter_prep };
}

export function detectEmergingJobSkills(jobs = [], engine, { recentDays = 30, now = new Date(), topK = 3 } = {}) {
  if (!Array.isArray(jobs) || !jobs.length || !engine) return [];
  const generic = engine.GENERIC_SKILL_IDS || new Set();
  const cutoffMs = now.getTime() - recentDays * 86400 * 1000;
  const recentCounts = new Map();
  const baselineCounts = new Map();
  let recentTotal = 0;
  let baselineTotal = 0;

  for (const job of jobs) {
    if (job?.kind && job.kind !== 'job') continue;
    const obsDate = Date.parse(job.snapshotDate || job.sourceSnapshot?.lastSeenAt || job.citation?.publishDate || '');
    const isRecent = Number.isFinite(obsDate) && obsDate >= cutoffMs;
    if (isRecent) recentTotal++;
    else baselineTotal++;
    for (const sk of job.skills || []) {
      if (!sk?.skillId || generic.has(sk.skillId)) continue;
      const map = isRecent ? recentCounts : baselineCounts;
      map.set(sk.skillId, (map.get(sk.skillId) || 0) + 1);
    }
  }

  const allSkills = new Set([...recentCounts.keys(), ...baselineCounts.keys()]);
  const scored = [];
  for (const skillId of allSkills) {
    const rCount = recentCounts.get(skillId) || 0;
    const bCount = baselineCounts.get(skillId) || 0;
    if (rCount + bCount < 2) continue;
    const rShare = recentTotal > 0 ? rCount / recentTotal : 0;
    const bShare = baselineTotal > 0 ? bCount / baselineTotal : 0;
    const lift = rShare - bShare * 0.7 + (rCount + bCount) * 0.002;
    scored.push({
      skillId,
      skillName: engine.skillName(skillId),
      recentCount: rCount,
      totalCount: rCount + bCount,
      lift: Number(lift.toFixed(4)),
    });
  }
  return scored.sort((a, b) => b.lift - a.lift || b.totalCount - a.totalCount).slice(0, topK);
}

export function allocateChannelQuotas(sourceStats = [], { totalBudget = 30, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const statsById = new Map(sourceStats.map(s => [s.sourceId, s]));
  const totalRunsAll = Math.max(1, sourceStats.reduce((sum, s) => sum + (s.totalRuns || 0), 0));

  const weights = [];
  for (const ch of EXPERIENCE_CHANNELS) {
    const st = statsById.get(ch.id);
    if (st && st.enabled === false) continue;
    const cooldownMs = st?.cooldownUntil ? Date.parse(st.cooldownUntil) : 0;
    if (Number.isFinite(cooldownMs) && cooldownMs > nowMs) continue;

    const runs = st?.totalRuns || 0;
    const fetched = st?.totalFetched || 0;
    const accepted = st?.totalAccepted || 0;
    const empiricalYield = fetched > 0 ? accepted / fetched : ch.prior * 0.65;
    const exploration = Math.min(0.45, 0.25 * Math.sqrt((2 * Math.log(totalRunsAll + 1)) / (runs + 1)));
    const failPenalty = Math.min(0.35, (st?.consecutiveFails || 0) * 0.12);
    const ucbScore = Math.max(0.1, empiricalYield + exploration + ch.prior * 0.2 - failPenalty);
    weights.push({ channelId: ch.id, ucbScore: Number(ucbScore.toFixed(4)) });
  }

  if (!weights.length) return new Map();
  const weightSum = weights.reduce((s, w) => s + w.ucbScore, 0);
  const quotas = new Map();
  let assigned = 0;
  for (const w of weights) {
    const q = Math.max(1, Math.floor((w.ucbScore / weightSum) * totalBudget));
    quotas.set(w.channelId, q);
    assigned += q;
  }
  let idx = 0;
  weights.sort((a, b) => b.ucbScore - a.ucbScore);
  while (assigned < totalBudget) {
    const cid = weights[idx % weights.length].channelId;
    quotas.set(cid, quotas.get(cid) + 1);
    assigned++;
    idx++;
  }
  return quotas;
}

export function planWeeklyQueries({
  now = new Date(),
  jobs = [],
  engine = null,
  storedSeeds = [],
  channelQuotas = null,
} = {}) {
  const season = detectSeasonTheme(now);
  const gradYear = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear() + 1;
  const seeds = storedSeeds.length ? storedSeeds : defaultQuerySeeds();
  const emerging = detectEmergingJobSkills(jobs, engine, { now, topK: 3 });

  const dynamicSeeds = emerging.map(sk => ({
    seedId: `dyn_skill_${sk.skillId}`,
    channel: 'nowcoder',
    queryTemplate: `site:nowcoder.com "${sk.skillName.split(/[ /（(]/)[0]}" (${season.keywords[0] || '面经'} OR 实习复盘)`,
    paths: ['jiuye'],
    seasonMonths: [season.month],
    skillId: sk.skillId,
    adoptionScore: 0.8,
  }));

  const quotas = channelQuotas || allocateChannelQuotas([], { totalBudget: 25, now });
  const planned = [];
  for (const seed of [...dynamicSeeds, ...seeds]) {
    if (!quotas.has(seed.channel)) continue;
    if (Array.isArray(seed.seasonMonths) && seed.seasonMonths.length && !seed.seasonMonths.includes(season.month)) continue;
    const query = seed.queryTemplate.replaceAll('{gradYear}', String(gradYear));
    planned.push({
      seedId: seed.seedId,
      channel: seed.channel,
      query,
      paths: seed.paths,
      skillId: seed.skillId || null,
      priority: Number(((seed.adoptionScore ?? 0.5) + (seed.paths.some(p => season.boostPaths.includes(p)) ? 0.15 : 0)).toFixed(3)),
    });
  }

  planned.sort((a, b) => b.priority - a.priority || a.seedId.localeCompare(b.seedId));
  return {
    season,
    gradYear,
    emergingSkills: emerging,
    queries: planned,
  };
}
