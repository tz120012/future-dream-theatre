import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronDown, CircleHelp,
  Download, Heart, Image as ImageIcon, LockKeyhole, Mic, Play, RefreshCw,
  Settings2, ShieldCheck, Sparkles, Trash2, Upload, Volume2, WandSparkles, X, Zap,
} from 'lucide-react'
import './App.css'
import { addResponse, analyzeConversationTurn, analyzeDream, askFutureSelf, clearRemoteSession, createSession, deleteRemoteSession, guessGenderByName, readGlobalSettings, startDreamCardGeneration, transcribeAudio, updateGlobalSettings, waitForGeneration, type ConversationTurnResult, type DreamAnalysis, type DreamResponse, type FutureSelfTurn } from './services/api'
import { loadLocalSettings, saveLocalSettings, type GlobalSettings } from './services/settings'
import coverSpace from './assets/cover-space.png'

type View = 'entry' | 'setup' | 'device' | 'welcome' | 'interview' | 'analyzing' | 'dream-review' | 'photo' | 'generating' | 'card' | 'future' | 'complete' | 'poster'
type PhotoMode = 'cartoon' | 'photo' | 'none'
type Dream = { role: string; roleIcon: string; scene: string; quote: string; accent: string; action?: string }
type ChildGender = 'boy' | 'girl' | ''
type RosterEntry = {
  id: string
  name: string
  gender: ChildGender
  role: string
  roleIcon: string
  quote: string
  accent: string
  imageUrl: string | null
  sessionNumber: number
}
type ConversationTurn = { id: string; questionIndex: number; question: string; answer: string; source: 'voice' | 'choice' }
type ChildConversationState = 'idle' | 'speaking' | 'listening' | 'transcribing' | 'thinking' | 'replying' | 'generating' | 'completed' | 'paused' | 'error'
type BrowserRecognitionResult = { isFinal: boolean; 0: { transcript: string }; length: number }
type BrowserRecognitionEvent = { resultIndex: number; results: ArrayLike<BrowserRecognitionResult> }
type BrowserRecognitionErrorEvent = { error: string }
type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: BrowserRecognitionEvent) => void) | null
  onerror: ((event: BrowserRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type BrowserRecognitionConstructor = new () => BrowserRecognition

const questions = [
  { label: '你最喜欢做什么，或者帮助谁？', helper: '可以说一件你觉得开心的事。', options: ['帮助小动物', '发明东西', '照顾植物', '我还不知道'] },
  { label: '如果长大后可以做一件有趣的事，你想做什么？', helper: '没有正确答案，想象一下就好。', options: ['探索大海', '飞去太空', '设计一座城', '讲故事给大家听'] },
  { label: '你希望在哪里完成这件事？', helper: '你可以选择一个地方，也可以自己说。', options: ['彩色森林', '海边实验室', '月亮基地', '热闹的城市'] },
]

const dreamPresets: Record<string, Dream> = {
  '帮助小动物': { role: '森林动物医生', roleIcon: '🦉', scene: '彩色森林里的小小诊所', quote: '我想让每一只小动物都健康、快乐。', accent: 'sage' },
  '发明东西': { role: '未来发明家', roleIcon: '🛠️', scene: '屋顶上的创意实验室', quote: '我想发明一个能帮助大家的东西。', accent: 'coral' },
  '照顾植物': { role: '植物魔法师', roleIcon: '🌿', scene: '会发光的城市花园', quote: '我想让城市里到处都有绿色。', accent: 'mint' },
  '我还不知道': { role: '梦想探索家', roleIcon: '🧭', scene: '一座藏着许多秘密的未来城市', quote: '我想慢慢发现自己喜欢什么。', accent: 'blue' },
  '探索大海': { role: '海洋探险家', roleIcon: '🐳', scene: '海底的鲸鱼研究站', quote: '我想保护大海里的鲸鱼。', accent: 'blue' },
  '飞去太空': { role: '星际旅行家', roleIcon: '🚀', scene: '环绕月亮的观测基地', quote: '我想看看星星是不是也有自己的故事。', accent: 'violet' },
  '设计一座城': { role: '未来城市设计师', roleIcon: '🏙️', scene: '会和树一起长大的城市', quote: '我想设计一座大家都喜欢的城市。', accent: 'coral' },
  '讲故事给大家听': { role: '星光故事家', roleIcon: '📖', scene: '漂浮在云朵上的故事剧场', quote: '我想把好玩的故事讲给每个人听。', accent: 'violet' },
}
const defaultDream = dreamPresets['我还不知道']

function roleVisual(role: string): Pick<Dream, 'roleIcon' | 'accent'> {
  const text = role.toLowerCase()
  if (/消防|救火|灭火/u.test(text)) return { roleIcon: '🚒', accent: 'coral' }
  if (/医生|护士|看病|救人|大夫|牙医/u.test(text)) return { roleIcon: '🩺', accent: 'mint' }
  if (/飞行|飞机|机长/u.test(text)) return { roleIcon: '✈️', accent: 'blue' }
  if (/宇航|航天|太空|星际/u.test(text)) return { roleIcon: '🚀', accent: 'violet' }
  if (/歌手|歌星|唱歌|音乐|弹琴/u.test(text)) return { roleIcon: '🎤', accent: 'violet' }
  if (/舞蹈|跳舞|芭蕾/u.test(text)) return { roleIcon: '💃', accent: 'coral' }
  if (/运动员|足球|篮球|球星|球员/u.test(text)) return { roleIcon: '⚽', accent: 'sage' }
  if (/赛车/u.test(text)) return { roleIcon: '🏎️', accent: 'coral' }
  if (/军人|解放军|士兵|战士|当兵/u.test(text)) return { roleIcon: '🎖️', accent: 'sage' }
  if (/警察|交警|警官/u.test(text)) return { roleIcon: '👮', accent: 'blue' }
  if (/老师|教师|教练/u.test(text)) return { roleIcon: '📚', accent: 'sage' }
  if (/厨师|做饭|大厨/u.test(text)) return { roleIcon: '👩‍🍳', accent: 'coral' }
  if (/面包|烘焙|糕点/u.test(text)) return { roleIcon: '🥐', accent: 'coral' }
  if (/科学|实验/u.test(text)) return { roleIcon: '🔬', accent: 'blue' }
  if (/工程|发明|机器|修理/u.test(text)) return { roleIcon: '🔧', accent: 'blue' }
  if (/挖掘机|工程车|挖土/u.test(text)) return { roleIcon: '🚜', accent: 'coral' }
  if (/司机|公交车|卡车/u.test(text)) return { roleIcon: '🚌', accent: 'blue' }
  if (/船长|航海|水手/u.test(text)) return { roleIcon: '⛵', accent: 'blue' }
  if (/农场|农民|种地/u.test(text)) return { roleIcon: '🌾', accent: 'sage' }
  if (/建筑|盖房子|造桥/u.test(text)) return { roleIcon: '🏗️', accent: 'coral' }
  if (/程序员|代码|游戏设计/u.test(text)) return { roleIcon: '💻', accent: 'blue' }
  if (/摄影|拍照/u.test(text)) return { roleIcon: '📷', accent: 'mint' }
  if (/魔术/u.test(text)) return { roleIcon: '🎩', accent: 'violet' }
  if (/公主|女王|艾莎|爱莎/u.test(text)) return { roleIcon: '👑', accent: 'violet' }
  if (/超级英雄|英雄|蜘蛛侠|奥特曼|钢铁侠/u.test(text)) return { roleIcon: '🦸', accent: 'coral' }
  if (/律师|法官/u.test(text)) return { roleIcon: '⚖️', accent: 'blue' }
  if (/主持|记者/u.test(text)) return { roleIcon: '🎙️', accent: 'coral' }
  if (/理发/u.test(text)) return { roleIcon: '💇', accent: 'mint' }
  if (/快递|外卖/u.test(text)) return { roleIcon: '📦', accent: 'coral' }
  if (/木匠|木头|木工/u.test(text)) return { roleIcon: '🪚', accent: 'sage' }
  if (/饲养员|动物园/u.test(text)) return { roleIcon: '🦁', accent: 'sage' }
  if (/动物|小狗|小猫|宠物/u.test(text)) return { roleIcon: '🐾', accent: 'sage' }
  if (/园艺|花|树|植物/u.test(text)) return { roleIcon: '🌱', accent: 'mint' }
  if (/潜水|大海|海洋|鲸鱼/u.test(text)) return { roleIcon: '🤿', accent: 'blue' }
  if (/画|故事|唱|跳舞|表演/u.test(text)) return { roleIcon: '🎨', accent: 'violet' }
  return { roleIcon: '✨', accent: 'blue' }
}

// Shared with the backend template table in backend/main.py. Terms are matched
// as substrings, so keep the words children actually say ("当兵", "大夫", "挖掘机").
type DreamRoleRow = [string[], string, string, string]
type DreamHintRow = [string[], string, string]

const dreamRoleTable: DreamRoleRow[] = [
  [['医生', '大夫', '护士', '医师', '牙医'], '医生', '在诊室里用听诊器帮助别人', '明亮温暖的儿童诊室'],
  [['消防员', '救火员', '消防队员'], '消防员', '穿着卡通消防服，用水枪帮助大家安全灭火', '消防站和安全的救援现场'],
  [['飞行员', '机长', '飞机师'], '飞行员', '坐在驾驶舱里驾驶飞机，观察云朵和天空', '蓝天白云里的飞机驾驶舱'],
  [['宇航员', '航天员', '太空人'], '宇航员', '穿着太空服探索星星和月亮', '有彩色星球的太空站'],
  [['赛车手', '赛车运动员', '赛车'], '赛车手', '戴着头盔在赛道上开赛车', '阳光下的卡通赛车场'],
  [['运动员', '足球运动员', '篮球运动员', '足球明星', '球星', '球员'], '运动员', '在球场上和大家一起运动比赛', '热闹的儿童运动场'],
  [['警察', '警官', '交警', '民警'], '警察', '在安全的街道上帮助大家平安出行', '阳光下的友好城市街道'],
  [['老师', '教师', '幼师', '园长'], '老师', '在教室里和小朋友一起学习和讲故事', '明亮的幼儿园教室'],
  [['厨师', '大厨', '厨子', '面点师'], '厨师', '在干净的厨房里准备美味的食物', '明亮整洁的卡通厨房'],
  [['面包师', '烘焙师', '糕点师'], '面包师', '在面包房里烤香喷喷的面包和蛋糕', '飘着麦香的面包房'],
  [['画家', '画师', '艺术家'], '画家', '用画笔画出五颜六色的世界', '摆满画笔的阳光画室'],
  [['科学家'], '科学家', '在实验室里做有趣的实验，发现新东西', '摆满烧杯和星星灯的科学实验室'],
  [['工程师', '发明家', '机器人专家'], '工程师', '动手发明和修理有趣的机器', '有很多工具的工作台'],
  [['动物医生', '兽医'], '动物医生', '在森林小诊所照顾小动物', '彩色森林里的温暖小诊所'],
  [['园艺师', '园丁', '花匠'], '园艺师', '照顾花花草草，让花园变漂亮', '开满鲜花的小花园'],
  [['潜水员', '潜水教练'], '潜水员', '潜到大海里和鱼儿一起游', '蓝蓝的大海里'],
  [['歌手', '歌星', '歌唱家', '音乐家'], '歌手', '站在舞台上唱歌给大家听', '闪着彩灯的儿童舞台'],
  [['舞蹈家', '舞者', '舞蹈演员'], '舞蹈家', '穿着漂亮的舞裙跳舞', '洒满阳光的舞蹈教室'],
  [['军人', '解放军', '士兵', '战士', '当兵'], '军人', '穿着整齐的军装保护大家', '飘扬着红旗的营地'],
  [['程序员', '软件工程师', '游戏设计师'], '程序员', '用电脑做好玩的游戏和小工具', '摆着很多屏幕的创意工作室'],
  [['建筑师', '建造师'], '建筑师', '画出图纸，盖出漂亮的房子和桥', '正在建造的积木城市'],
  [['摄影师', '摄影家'], '摄影师', '拿着相机拍下美好的瞬间', '开满花的公园'],
  [['挖掘机司机', '工程车司机', '挖掘机'], '挖掘机司机', '开着挖掘机挖土，帮大家修路盖房子', '热闹的建筑工地'],
  [['船长', '水手', '航海家'], '船长', '开着大船在海上航行', '蓝色大海上的大船'],
  [['公交车司机', '卡车司机', '出租车司机', '公交车', '卡车', '司机'], '司机', '开着车把大家安全送到想去的地方', '城市里的公交车站'],
  [['农场主', '农民'], '农场主', '在田野里种庄稼、照顾小动物', '金黄色的农场'],
  [['魔术师'], '魔术师', '变出让人惊喜的魔术', '有彩色幕布的儿童剧场'],
  [['公主', '女王', '艾莎', '爱莎'], '公主', '穿着漂亮的裙子住在城堡里', '糖果色的童话城堡'],
  [['超级英雄', '超人', '英雄', '蜘蛛侠', '奥特曼', '钢铁侠'], '超级英雄', '飞过城市去帮助需要帮助的人', '城市上空的彩虹云朵'],
  [['律师', '法官'], '律师', '帮大家把事情说清楚、讲道理', '明亮安静的图书馆'],
  [['主持人', '记者'], '主持人', '拿着话筒把好消息讲给大家听', '灯光闪闪的小舞台'],
  [['理发师', '造型师'], '理发师', '帮大家剪出好看的头发', '明亮干净的理发店'],
  [['快递员', '外卖员'], '快递员', '骑着车把包裹送到大家手里', '热闹的街道'],
  [['木匠', '手艺人'], '木匠', '用木头做出结实又好玩的东西', '有木屑香味的工坊'],
  [['饲养员', '动物园管理员'], '饲养员', '在动物园里照顾长颈鹿和大象', '绿树成荫的动物园'],
]

const dreamHintTable: DreamHintRow[] = [
  [['看病', '治病', '受伤', '打针', '吃药', '照顾病人', '救人'], '医生', '你是不是想当医生，给生病的人看病呀？'],
  [['救火', '灭火', '消防'], '消防员', '你是不是想当消防员，去救火呀？'],
  [['开飞机', '飞行', '飞到天上', '飞起来', '飞机'], '飞行员', '你是不是想当飞行员，开飞机呀？'],
  [['太空', '星星', '火箭', '月亮', '宇宙', '月球'], '宇航员', '你是不是想当宇航员，飞到太空去呀？'],
  [['唱歌', '唱一首', '音乐', '弹琴', '弹吉他'], '歌手', '你是不是想当歌手，唱歌给大家听呀？'],
  [['跳舞', '芭蕾', '舞蹈'], '舞蹈家', '你是不是想当舞蹈家，跳舞给大家看呀？'],
  [['踢球', '打球', '足球', '篮球', '跑步', '比赛'], '运动员', '你是不是想当运动员，参加比赛呀？'],
  [['开车比赛', '开快车', '赛车'], '赛车手', '你是不是想当赛车手，开赛车呀？'],
  [['上课', '教小朋友', '教书', '带小朋友'], '老师', '你是不是想当老师，教小朋友呀？'],
  [['做饭', '做菜', '煮饭', '美食', '烤蛋糕'], '厨师', '你是不是想当厨师，做好吃的东西呀？'],
  [['做面包', '烤面包', '做点心'], '面包师', '你是不是想当面包师，烤香香的面包呀？'],
  [['抓坏人', '保护大家', '指挥交通'], '警察', '你是不是想当警察，保护大家的安全呀？'],
  [['动物', '小狗', '小猫', '宠物', '照顾小动物'], '动物医生', '你是不是想当动物医生，照顾小动物呀？'],
  [['发明', '创造', '机器人', '修理', '制作'], '工程师', '你是不是想当工程师，发明很多新东西呀？'],
  [['做实验', '研究'], '科学家', '你是不是想当科学家，做有趣的实验呀？'],
  [['植物', '花', '树', '种植', '花园'], '园艺师', '你是不是想当园艺师，照顾花花草草呀？'],
  [['大海', '海洋', '游泳', '海底', '鲸鱼'], '潜水员', '你是不是想当潜水员，去大海里看看呀？'],
  [['画画', '画图', '涂鸦', '美术'], '画家', '你是不是想当画家，画很多好看的画呀？'],
  [['盖房子', '建房子', '造桥', '搭积木'], '建筑师', '你是不是想当建筑师，盖漂亮的房子呀？'],
  [['写代码', '编程', '做游戏', '电脑'], '程序员', '你是不是想当程序员，做好玩的游戏呀？'],
  [['拍照', '拍照片', '相机'], '摄影师', '你是不是想当摄影师，拍好看的照片呀？'],
  [['挖掘机', '挖土', '开工程车'], '挖掘机司机', '你是不是想开挖掘机，帮大家修路盖房子呀？'],
  [['开船', '轮船', '航海'], '船长', '你是不是想当船长，开着大船去远航呀？'],
  [['开公交车', '开卡车', '开车', '送乘客'], '司机', '你是不是想当司机，开车送大家呀？'],
  [['种地', '农场', '养鸡', '养牛'], '农场主', '你是不是想当农场主，照顾庄稼和小动物呀？'],
  [['变魔术', '魔术'], '魔术师', '你是不是想当魔术师，变出惊喜呀？'],
  [['保护国家', '站岗', '穿军装', '敬礼'], '军人', '你是不是想当军人，保护大家呀？'],
  [['剪头发', '理发'], '理发师', '你是不是想当理发师，帮大家剪头发呀？'],
  [['送快递', '送包裹', '送外卖'], '快递员', '你是不是想当快递员，把包裹送到大家手里呀？'],
  [['做木头', '木工', '做家具'], '木匠', '你是不是想当木匠，用木头做好玩的东西呀？'],
  [['喂动物', '照顾长颈鹿', '照顾大象'], '饲养员', '你是不是想当饲养员，照顾动物园里的动物呀？'],
  [['帮助别人', '照顾别人', '保护别人'], '医生', '你是不是想当医生，帮助别人呀？'],
]

const refusalPattern = /不知道|不想说|不说|没想好|还没想|随便|不想聊|不告诉你|不想谈/u
const negativeRolePattern = /(不想|不要|不喜欢)(当|做|成为|干)/u
const dreamMarkerPattern = /想|要|希望|梦想|长大|以后|将来/u
const dreamLeadWords = ['我的梦想是', '我的梦想', '梦想是', '我长大以后', '我长大了', '长大以后', '长大后', '我以后', '以后', '将来', '想要', '想成为', '想当', '想做', '希望', '要当', '要做', '我', '想', '要', '当', '做']
const confirmationPrefix = /^(是的|是呀|是|对呀|对的|对|嗯嗯|嗯|好呀|好的|好|没错|就是|可以|行|当然)/u
const confirmationNegation = ['不是', '不对', '不想', '不要', '没有', '不知道', '不呀', '不嘛']

function dreamRoleDetails(role: string): { action: string; scene: string } {
  const row = dreamRoleTable.find(([, label]) => label === role)
  return row ? { action: row[2], scene: row[3] } : { action: '做一件让自己开心的事情', scene: '一座充满奇妙发现的未来乐园' }
}

function matchDreamRole(text: string): DreamRoleRow | undefined {
  return dreamRoleTable.find(([terms]) => terms.some((term) => text.includes(term)))
}

function matchDreamHint(text: string): DreamHintRow | undefined {
  return dreamHintTable.find(([terms]) => terms.some((term) => text.includes(term)))
}

function looksLikeDream(text: string): boolean {
  return dreamMarkerPattern.test(text) && !refusalPattern.test(text)
}

function cleanDreamPhrase(text: string): string {
  // Only the first clause carries the dream: "我想养老鼠我长大想养老鼠" -> "养老鼠".
  for (const clause of text.split(/我|长大|以后|将来|因为|然后|可是|但是|[，。！？!?,.]/u)) {
    let value = clause.replace(/[\s、~…“”"'（）()]/gu, '')
    if (!value) continue
    let changed = true
    while (changed && value) {
      changed = false
      for (const lead of dreamLeadWords) {
        if (value.startsWith(lead) && value.length > lead.length) {
          value = value.slice(lead.length)
          changed = true
          break
        }
      }
    }
    value = value.replace(/^[的了呀啊呢吧哦嘛啦]+|[的了呀啊呢吧哦嘛啦]+$/gu, '')
    if (value.length >= 2) return value.slice(0, 12)
  }
  return ''
}

const animalTerms = ['老鼠', '仓鼠', '兔子', '兔兔', '小狗', '狗狗', '小猫', '猫咪', '宠物', '金鱼', '小鱼', '小鸟', '小乌龟', '乌龟', '恐龙', '小动物', '动物', '大象', '长颈鹿', '熊猫', '猴子', '蚂蚁', '蜗牛', '小鸡', '小鸭']
const plantTerms = ['花', '草', '树', '植物', '种子', '花园', '菜']
const careVerbs = ['养', '照顾', '喂', '陪伴', '陪', '一起玩']
const animalMedicalTerms = ['看病', '治病', '受伤', '打针', '吃药', '生病', '治疗']

function careRoleHint(text: string): { role: string; question: string } | undefined {
  if (animalTerms.some((term) => text.includes(term))) {
    if (animalMedicalTerms.some((term) => text.includes(term))) {
      return { role: '动物医生', question: '你是不是想当动物医生，给小动物看病呀？' }
    }
    if (careVerbs.some((verb) => text.includes(verb))) {
      return { role: '饲养员', question: '你是不是想当饲养员，照顾小动物呀？' }
    }
  }
  if (plantTerms.some((term) => text.includes(term)) && ['养', '照顾', '种', '浇'].some((verb) => text.includes(verb))) {
    return { role: '园艺师', question: '你是不是想当园艺师，照顾花花草草呀？' }
  }
  return undefined
}

function isConfirmationText(text: string): boolean {
  const stripped = text.replace(/[\s，。！？、,.!?~…“”"'（）()]/gu, '')
  if (!stripped || stripped.length > 16) return false
  if (stripped === '想' || stripped === '要' || stripped === '我想' || stripped === '我要') return false
  if (confirmationNegation.some((term) => stripped.includes(term))) return false
  if (dreamMarkerPattern.test(stripped) && stripped.length > 4) return false
  return confirmationPrefix.test(stripped)
}

function dreamTurnResult(fields: Partial<ConversationTurnResult> & { reply: string }): ConversationTurnResult {
  return {
    intent: 'interest', role: null, action: null, scene: null, subject: '儿童自己',
    needs_follow_up: true, follow_up_question: null, confidence: .5, ready_to_generate: false,
    image_prompt: '', safety_flags: [], source: 'template', ...fields,
  }
}

function createLocalDreamAnalysis(answers: DreamResponse[], source: DreamAnalysis['source'] = 'template'): DreamAnalysis {
  const text = answers.map((answer) => answer.text).join(' ')
  const presetRules: Array<[RegExp, Dream]> = [
    [/动物|小狗|小猫|宠物|照顾|保护/u, dreamPresets['帮助小动物']],
    [/发明|创造|机器人|修理|制作/u, dreamPresets['发明东西']],
    [/植物|花|树|种植|绿色/u, dreamPresets['照顾植物']],
    [/大海|海洋|鲸鱼|海底|游泳/u, dreamPresets['探索大海']],
    [/太空|星星|月亮|宇宙|火箭|飞行/u, dreamPresets['飞去太空']],
    [/城市|房子|设计|建造|街道/u, dreamPresets['设计一座城']],
    [/故事|画画|唱歌|表演|讲给大家/u, dreamPresets['讲故事给大家听']],
  ]
  const preset = presetRules.find(([pattern]) => pattern.test(text))?.[1] ?? defaultDream
  const secondOption = preset.role === defaultDream.role
      ? { label: '森林动物医生', reason: '也可以想象照顾小动物，看看自己喜不喜欢。' }
    : { label: defaultDream.role, reason: '也可以先不选职业，继续探索自己喜欢做的事。' }
  return {
    summary: '从你的回答里，我听到了一些想法。看看下面的方向，哪一个最像你？',
    interests: preset.role === defaultDream.role ? ['自由想象', '继续探索'] : [preset.role, '自由想象'],
    role: preset.role,
    role_icon: preset.roleIcon,
    accent: preset.accent as DreamAnalysis['accent'],
    scene: preset.scene,
    quote: preset.quote,
    possible_roles: [
      { label: preset.role, reason: '这是根据刚刚聊到的内容整理出的一个想象方向。' },
      secondOption,
    ],
    source,
  }
}

function escapeXmlText(text: string): string {
  return text.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character)
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

function App() {
  const [view, setView] = useState<View>('entry')
  const [mode, setMode] = useState<'classroom' | 'family'>('classroom')
  const [sessionNumber, setSessionNumber] = useState(1)
  const [ageGroup, setAgeGroup] = useState('3-4 岁')
  const [theme, setTheme] = useState('自由想象')
  const [style, setStyle] = useState('明亮插画')
  const [photoMode, setPhotoMode] = useState<PhotoMode>('cartoon')
  const [voiceEnabled, setVoiceEnabled] = useState(() => loadLocalSettings().ttsEnabled)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(() => loadLocalSettings())
  const [settingsDraft, setSettingsDraft] = useState<GlobalSettings>(() => loadLocalSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [clearSavedApiKey, setClearSavedApiKey] = useState(false)
  const [clearSavedSiliconFlowKey, setClearSavedSiliconFlowKey] = useState(false)
  const [remoteApiKeyConfigured, setRemoteApiKeyConfigured] = useState(false)
  const [remoteSiliconFlowKeyConfigured, setRemoteSiliconFlowKeyConfigured] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([])
  const [adaptiveTurns, setAdaptiveTurns] = useState<DreamResponse[]>([])
  const [conversationState, setConversationState] = useState<ChildConversationState>('idle')
  const [adaptiveResult, setAdaptiveResult] = useState<ConversationTurnResult | null>(null)
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'system' | 'child'; text: string }>>([])
  const [childName, setChildName] = useState('')
  const [childGender, setChildGender] = useState<ChildGender>('')
  const [nameInput, setNameInput] = useState('')
  const [nameStage, setNameStage] = useState<'ask' | 'done'>('ask')
  const [genderGuessing, setGenderGuessing] = useState(false)
  const [classRoster, setClassRoster] = useState<RosterEntry[]>([])
  const nameBubbleAddedRef = useRef(false)
  const [showFallbackChoices, setShowFallbackChoices] = useState(false)
  const [dreamAnalysis, setDreamAnalysis] = useState<DreamAnalysis | null>(null)
  const [selectedDreamRole, setSelectedDreamRole] = useState('')
  const [customDreamRole, setCustomDreamRole] = useState('')
  const [onlineTextConsent, setOnlineTextConsent] = useState(false)
  const [onlineImageConsent, setOnlineImageConsent] = useState(false)
  const [onlinePhotoConsent, setOnlinePhotoConsent] = useState(false)
  const [photoAgeMode, setPhotoAgeMode] = useState<'grown' | 'now'>('grown')
  // "quality" uses the watercolor storybook model; "fast" uses the distilled
  // model so a short class slot can still finish the card.
  const [renderMode, setRenderMode] = useState<'quality' | 'fast'>(() => {
    try { return window.localStorage.getItem('future-dream-render-mode') === 'fast' ? 'fast' : 'quality' } catch { return 'quality' }
  })
  const [isListening, setIsListening] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [deviceStatus, setDeviceStatus] = useState<'idle' | 'checking' | 'ready' | 'fallback'>('idle')
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle')
  const [microphoneStatus, setMicrophoneStatus] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle')
  const [cameraError, setCameraError] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [dream, setDream] = useState<Dream>(defaultDream)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState('')
  const [futureReply, setFutureReply] = useState('')
  const [futureInput, setFutureInput] = useState('')
  const [futurePending, setFuturePending] = useState(false)
  const [futureTurns, setFutureTurns] = useState<FutureSelfTurn[]>([])
  const [privacyMessage, setPrivacyMessage] = useState('当前会话数据仅用于本次体验')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<'local' | 'connected'>('local')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceMonitorTimerRef = useRef<number | undefined>(undefined)
  const speechDetectedRef = useRef(false)
  const transcribeWhenStoppedRef = useRef(false)
  const transcriptionAbortRef = useRef<AbortController | null>(null)
  const browserRecognitionRef = useRef<BrowserRecognition | null>(null)
  const browserTranscriptRef = useRef('')
  const browserStopRequestedRef = useRef(false)
  const browserRestartTimerRef = useRef<number | undefined>(undefined)
  const browserSilenceTimerRef = useRef<number | undefined>(undefined)
  const voiceActiveRef = useRef(false)
  const voiceTimeoutRef = useRef<number | undefined>(undefined)
  const generationTimerRef = useRef<number | undefined>(undefined)
  const adaptiveTurnInFlightRef = useRef(false)
  const chatBubblesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view === 'interview' && chatBubblesRef.current) {
      chatBubblesRef.current.scrollTop = chatBubblesRef.current.scrollHeight
    }
  }, [chatMessages, view, conversationState])
  const currentQuestion = questions[questionIndex]
  const progress = view === 'analyzing' ? 78 : view === 'dream-review' ? 84 : Math.round(((questionIndex + (view === 'interview' ? 0 : 1)) / questions.length) * 100)

  const statusLabel = useMemo(() => ({
    entry: '准备开始', setup: '课堂设置', device: '设备检查', welcome: '欢迎来到梦想剧场',
    interview: `梦想聊天 · 第 ${adaptiveTurns.length + 1} 句`, analyzing: '正在整理你的想法', 'dream-review': '确认梦想方向', photo: '选择照片方式',
    generating: '正在画出想象中的未来', card: '梦想卡预览', future: '想象中的未来自己', complete: '本次体验完成', poster: '班级梦想海报',
  } as Record<View, string>)[view], [adaptiveTurns.length, view])

  useEffect(() => () => { stopCamera(); stopVoice(); if (generationTimerRef.current) window.clearTimeout(generationTimerRef.current) }, [])
  useEffect(() => {
    if (!settingsOpen) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsOpen(false) }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen])
  useEffect(() => {
    void readGlobalSettings().then((remote) => {
      setRemoteApiKeyConfigured(remote.openai_api_key_configured)
      setRemoteSiliconFlowKeyConfigured(remote.siliconflow_api_key_configured)
      setGlobalSettings((current) => {
        const next = {
          ...current,
          sttProvider: remote.stt_provider,
          whisperModel: remote.whisper_model,
          llmProvider: remote.llm_provider,
          openaiBaseUrl: remote.openai_base_url,
          openaiModel: remote.openai_model,
          siliconflowChatModel: remote.siliconflow_chat_model,
          siliconflowImageModel: remote.siliconflow_image_model,
          siliconflowImageFastModel: remote.siliconflow_image_fast_model,
          siliconflowImageEditModel: remote.siliconflow_image_edit_model,
          imageProvider: remote.image_provider,
          retentionMinutes: remote.retention_minutes,
        }
        saveLocalSettings(next)
        return next
      })
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (view === 'photo' && photoMode === 'photo') void startCamera()
    else stopCamera()
  }, [photoMode, view])

  function speak(text: string) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'; utterance.rate = .95; window.speechSynthesis.speak(utterance)
  }
  function speakAndThen(text: string, onDone: () => void) {
    if (!voiceEnabled || !('speechSynthesis' in window)) {
      window.setTimeout(onDone, 350)
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      onDone()
    }
    window.speechSynthesis.cancel()
    if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'; utterance.rate = .92
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
    // Safety fallback: some browsers occasionally fail to fire onend/onerror,
    // which would leave the conversation stuck. Force progression after a cap.
    const estimatedMs = Math.max(350, text.length * 220)
    window.setTimeout(finish, estimatedMs + 4000)
  }
  function browserRecognitionConstructor() {
    const recognitionWindow = window as Window & {
      SpeechRecognition?: BrowserRecognitionConstructor
      webkitSpeechRecognition?: BrowserRecognitionConstructor
    }
    return recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition
  }
  function openGlobalSettings() {
    setSettingsDraft({ ...globalSettings, ttsEnabled: voiceEnabled, openaiApiKey: '', siliconflowApiKey: '' })
    setSettingsError('')
    setClearSavedApiKey(false)
    setClearSavedSiliconFlowKey(false)
    setSettingsOpen(true)
    void readGlobalSettings().then((remote) => {
      setRemoteApiKeyConfigured(remote.openai_api_key_configured)
      setRemoteSiliconFlowKeyConfigured(remote.siliconflow_api_key_configured)
      setSettingsDraft((current) => ({
        ...current,
        sttProvider: remote.stt_provider,
        whisperModel: remote.whisper_model,
        llmProvider: remote.llm_provider,
        openaiBaseUrl: remote.openai_base_url,
        openaiModel: remote.openai_model,
        siliconflowChatModel: remote.siliconflow_chat_model,
        siliconflowImageModel: remote.siliconflow_image_model,
        siliconflowImageFastModel: remote.siliconflow_image_fast_model,
        siliconflowImageEditModel: remote.siliconflow_image_edit_model,
        imageProvider: remote.image_provider,
        retentionMinutes: remote.retention_minutes,
      }))
    }).catch(() => setSettingsError('暂时无法读取服务端设置，请确认本机 API 已启动。'))
  }
  async function saveSettings() {
    const hasOpenAiKey = Boolean(settingsDraft.openaiApiKey.trim()) || (remoteApiKeyConfigured && !clearSavedApiKey)
    const hasSiliconFlowKey = Boolean(settingsDraft.siliconflowApiKey.trim()) || (remoteSiliconFlowKeyConfigured && !clearSavedSiliconFlowKey)
    if (settingsDraft.llmProvider === 'openai_compatible' && !hasOpenAiKey) {
      setSettingsError('选择 OpenAI 兼容 API 前，请先填写 API Key。')
      return
    }
    if ((settingsDraft.llmProvider === 'siliconflow' || settingsDraft.imageProvider === 'siliconflow') && !hasSiliconFlowKey) {
      setSettingsError('启用硅基流动前，请先填写硅基流动 API Key。')
      return
    }
    setSettingsSaving(true)
    setSettingsError('')
    try {
      if (globalSettings.sttProvider !== settingsDraft.sttProvider) stopVoice()
      const remote = await updateGlobalSettings({
        stt_provider: settingsDraft.sttProvider,
        whisper_model: settingsDraft.whisperModel,
        llm_provider: settingsDraft.llmProvider,
        openai_base_url: settingsDraft.openaiBaseUrl,
        openai_model: settingsDraft.openaiModel,
        siliconflow_chat_model: settingsDraft.siliconflowChatModel,
        siliconflow_image_model: settingsDraft.siliconflowImageModel,
        siliconflow_image_fast_model: settingsDraft.siliconflowImageFastModel,
        siliconflow_image_edit_model: settingsDraft.siliconflowImageEditModel,
        tts_provider: 'browser',
        image_provider: settingsDraft.imageProvider,
        retention_minutes: settingsDraft.retentionMinutes,
        ...(settingsDraft.openaiApiKey.trim() ? { openai_api_key: settingsDraft.openaiApiKey.trim() } : {}),
        clear_openai_api_key: clearSavedApiKey,
        ...(settingsDraft.siliconflowApiKey.trim() ? { siliconflow_api_key: settingsDraft.siliconflowApiKey.trim() } : {}),
        clear_siliconflow_api_key: clearSavedSiliconFlowKey,
      })
      const next = { ...settingsDraft, openaiApiKey: '', siliconflowApiKey: '' }
      const onlineTargetChanged = globalSettings.llmProvider !== next.llmProvider
        || globalSettings.openaiBaseUrl !== next.openaiBaseUrl
        || globalSettings.openaiModel !== next.openaiModel
        || globalSettings.siliconflowChatModel !== next.siliconflowChatModel
        || globalSettings.siliconflowImageModel !== next.siliconflowImageModel
        || globalSettings.siliconflowImageFastModel !== next.siliconflowImageFastModel
        || globalSettings.siliconflowImageEditModel !== next.siliconflowImageEditModel
        || globalSettings.imageProvider !== next.imageProvider
        || Boolean(settingsDraft.openaiApiKey.trim())
        || Boolean(settingsDraft.siliconflowApiKey.trim())
        || clearSavedApiKey
        || clearSavedSiliconFlowKey
      if (onlineTargetChanged) setOnlineTextConsent(false)
      if (onlineTargetChanged) setOnlineImageConsent(false)
      setGlobalSettings(next)
      setSettingsDraft(next)
      setVoiceEnabled(next.ttsEnabled)
      saveLocalSettings(next)
      setRemoteApiKeyConfigured(remote.openai_api_key_configured)
      setRemoteSiliconFlowKeyConfigured(remote.siliconflow_api_key_configured)
      setClearSavedApiKey(false)
      setClearSavedSiliconFlowKey(false)
      setSettingsOpen(false)
    } catch {
      setSettingsError('保存失败。请检查本机服务是否运行后重试。')
    } finally {
      setSettingsSaving(false)
    }
  }
  function toggleVoiceEnabled() {
    const nextEnabled = !voiceEnabled
    setVoiceEnabled(nextEnabled)
    setGlobalSettings((current) => {
      const next = { ...current, ttsEnabled: nextEnabled }
      saveLocalSettings(next)
      return next
    })
  }
  function stopVoice() {
    voiceActiveRef.current = false
    if (voiceTimeoutRef.current) window.clearTimeout(voiceTimeoutRef.current)
    if (voiceMonitorTimerRef.current) window.clearInterval(voiceMonitorTimerRef.current)
    if (browserRestartTimerRef.current) window.clearTimeout(browserRestartTimerRef.current)
    if (browserSilenceTimerRef.current) window.clearTimeout(browserSilenceTimerRef.current)
    browserStopRequestedRef.current = false
    if (browserRecognitionRef.current) {
      browserRecognitionRef.current.onend = null
      browserRecognitionRef.current.abort()
      browserRecognitionRef.current = null
    }
    transcriptionAbortRef.current?.abort(); transcriptionAbortRef.current = null
    transcribeWhenStoppedRef.current = false
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioStreamRef.current = null; recorderRef.current = null; audioChunksRef.current = []
    audioAnalyserRef.current = null
    speechDetectedRef.current = false
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
    setIsListening(false); setIsRecording(false); setIsTranscribing(false)
    if (view === 'interview') setConversationState('paused')
  }
  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId
    try {
      const session = await createSession({ mode, age_group: ageGroup, theme, style })
      setSessionId(session.id); setApiStatus('connected'); return session.id
    } catch {
      setApiStatus('local'); return null
    }
  }
  function chooseMode(nextMode: 'classroom' | 'family') { setMode(nextMode); setOnlineTextConsent(false); setOnlineImageConsent(false); setView('setup') }
  function beginDeviceCheck() {
    setView('device'); setDeviceStatus('idle'); setCameraStatus('idle'); setMicrophoneStatus('idle'); setCameraError('')
  }
  function selectPhotoMode(nextMode: PhotoMode) {
    setPhotoMode(nextMode)
    setCameraError('')
    setOnlinePhotoConsent(false)
  }
  function mediaDeviceError(error: unknown, deviceName: string) {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return `${deviceName}权限没有打开。请点击地址栏左侧的锁形图标，在“摄像头/麦克风”中选择允许后重试。`
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return `没有检测到${deviceName}。可以点“上传照片”选一张正脸照，或改用卡通形象。`
    if (name === 'NotReadableError' || name === 'TrackStartError') return `${deviceName}可能正被其他软件占用。请关闭微信、Teams、相机等使用它的程序后重试。`
    if (name === 'SecurityError' || !window.isSecureContext) return '当前页面没有获得安全媒体权限。请使用 http://localhost 或 http://127.0.0.1 打开，或改用 HTTPS。'
    return `${deviceName}暂时不可用。可以跳过检查，稍后再试。`
  }
  async function probeMediaDevice(kind: 'audio' | 'video', deviceName: string) {
    if (!window.isSecureContext) return { ok: false, message: '当前页面没有获得安全媒体权限。请使用 http://localhost 或 http://127.0.0.1 打开，或改用 HTTPS。' }
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: '当前浏览器不支持摄像头或麦克风权限。可以继续使用点击选项和卡通形象。' }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: true } : { video: true })
      stream.getTracks().forEach((track) => track.stop())
      return { ok: true, message: '' }
    } catch (error) {
      return { ok: false, message: mediaDeviceError(error, deviceName) }
    }
  }
  async function checkDevices() {
    setDeviceStatus('checking'); setCameraStatus('checking'); setMicrophoneStatus('checking'); setCameraError('')
    const camera = await probeMediaDevice('video', '摄像头')
    setCameraStatus(camera.ok ? 'ready' : 'unavailable')
    const microphone = await probeMediaDevice('audio', '麦克风')
    setMicrophoneStatus(microphone.ok ? 'ready' : 'unavailable')
    const failures = [camera.message, microphone.message].filter(Boolean)
    if (!camera.ok || !microphone.ok) {
      setDeviceStatus(camera.ok || microphone.ok ? 'ready' : 'fallback')
      setCameraError(failures.length === 2 ? `设备检查未完全通过：${failures[0]} ${failures[1]}` : failures[0])
      return
    }
    setDeviceStatus('ready'); speak('设备检查完成，我们可以开始啦。')
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('当前浏览器不支持摄像头预览，可以点“上传照片”选一张正脸照。'); return }
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCameraStatus('ready')
      const label = stream.getVideoTracks()[0]?.label ?? ''
      // ToDesk exposes a virtual camera that usually has no real frames; it is
      // the most common reason Chrome shows a placeholder instead of a preview.
      if (/todesk/i.test(label)) {
        setCameraError(`当前摄像头是「${label}」虚拟设备，通常没有真实画面。可以点“上传照片”，或在 ToDesk 设置里开启摄像头重定向后重试。`)
      }
    } catch (error) {
      setCameraStatus('unavailable')
      // Keep the photo option selected: switching away silently made the page
      // look like it refused to take a photo. Offer the upload fallback instead.
      setCameraError(`${mediaDeviceError(error, '摄像头')} 也可以点“上传照片”，选一张正脸照。`)
    }
  }
  function stopCamera() { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null }
  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.readyState < 2) { setCameraError('还没有获取到画面，请稍等；也可以直接点“上传照片”。'); return }
    const sourceWidth = video.videoWidth || 640
    const sourceHeight = video.videoHeight || 480
    const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(sourceWidth * scale); canvas.height = Math.round(sourceHeight * scale)
    const context = canvas.getContext('2d')
    context?.drawImage(video, 0, 0, canvas.width, canvas.height)
    if (context) {
      // A virtual camera (e.g. ToDesk) can return an all-black or all-white
      // frame; capturing it would send a useless photo to the image model.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let min = 255
      let max = 0
      for (let index = 0; index < pixels.length; index += 4 * 64) {
        const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3
        if (value < min) min = value
        if (value > max) max = value
      }
      if (max - min < 12) {
        setCameraError('摄像头只返回了黑色或空白画面（常见于 ToDesk 等远程虚拟摄像头）。请点“上传照片”选一张孩子的正脸照。')
        return
      }
    }
    setPhotoPreview(canvas.toDataURL('image/jpeg', .86)); setOnlinePhotoConsent(false); stopCamera(); setPrivacyMessage('照片暂存于本次体验；只有勾选照片授权后才会发送给图片服务')
  }
  async function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setCameraError('请选择一张照片文件（JPG 或 PNG）。'); return }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      setPhotoPreview(canvas.toDataURL('image/jpeg', .86))
      setOnlinePhotoConsent(false)
      stopCamera()
      setCameraError('')
      setPrivacyMessage('照片暂存于本次体验；只有勾选照片授权后才会发送给图片服务')
    } catch {
      setCameraError('无法读取这张照片，请换一张正脸照试试。')
    }
  }
  async function startInterview() {
    await ensureSession()
    setQuestionIndex(0); setConversationTurns([]); setAdaptiveTurns([]); setAdaptiveResult(null); setShowFallbackChoices(false); setChatMessages([])
    setConversationState('idle'); setDreamAnalysis(null); setSelectedDreamRole(''); setCustomDreamRole('')
    setFutureReply(''); setFutureInput(''); setFuturePending(false); setFutureTurns([]); setView('welcome'); speak('你好呀！我们来一起想象未来的你。')
  }
  function beginChildConversation() {
    setView('interview')
    setConversationState('speaking')
    setVoiceError('')
    setNameStage('ask'); setChildName(''); setChildGender(''); setNameInput('')
    nameBubbleAddedRef.current = false
    const greeting = '你好呀！我是梦想小伙伴。你叫什么名字呀？'
    setChatMessages([{ id: `sys-${Date.now()}`, role: 'system', text: greeting }])
    // The microphone is never opened automatically: browsers may ignore a
    // getUserMedia call that follows speech synthesis without a user gesture,
    // which left the child talking into a recorder that captured nothing.
    // Every turn now waits for an explicit tap on the microphone orb.
    speakAndThen(greeting, () => {
      setConversationState('idle')
    })
  }
  function extractName(text: string): string {
    const cleaned = text.trim().replace(/[。，！？!?,.\s]+$/u, '')
    const match = cleaned.match(/(?:我叫|我是|名字叫|叫我)(.{1,12})$/u)
    const name = (match?.[1] ?? cleaned).replace(/[呀啊呢吧哦]+$/u, '').trim()
    // A long sentence without "我叫/我是" is usually a mis-transcription; ask
    // again instead of showing it as the child's name.
    if (!match && (name.length > 4 || /[我你他她说是就都很不吗叫]/u.test(name))) return ''
    return name.slice(0, 12)
  }
  function maybeGuessGender(name: string) {
    if (!name || globalSettings.llmProvider === 'template' || !onlineTextConsent || !sessionId) return
    setGenderGuessing(true)
    void guessGenderByName(name, true)
      .then((result) => { if (result.gender) setChildGender((current) => current || result.gender) })
      .catch(() => undefined)
      .finally(() => setGenderGuessing(false))
  }
  function handleNameAnswer(text: string) {
    stopVoice(); setVoiceError('')
    const name = extractName(text)
    nameBubbleAddedRef.current = true
    setChatMessages((current) => [...current, { id: `child-${Date.now()}`, role: 'child', text: text.trim() }])
    if (!name) {
      const askAgain = '我没有听清名字，可以再说一次吗？老师也可以帮忙写在下面。'
      setChatMessages((current) => [...current, { id: `sys-${Date.now()}`, role: 'system', text: askAgain }])
      speakAndThen(askAgain, () => { setConversationState('idle') })
      return
    }
    setNameInput(name)
    maybeGuessGender(name)
    setConversationState('idle')
    const confirmText = `你叫${name}，对吗？老师也可以帮忙改一改，确认后我们就开始聊梦想。`
    setChatMessages((current) => [...current, { id: `sys-${Date.now()}`, role: 'system', text: confirmText }])
    speak(confirmText)
  }
  function confirmChildName() {
    const name = nameInput.trim().slice(0, 12)
    if (!name) return
    stopVoice(); setVoiceError('')
    setChildName(name)
    setNameStage('done')
    setConversationState('speaking')
    const greeting = `${name}，你好呀！你想长大以后做什么呀？想到什么都可以告诉我。`
    // If the name was typed by the teacher (no voice answer), still show it as
    // a child bubble on the right so the chat reads like a real conversation.
    setChatMessages((current) => [
      ...current,
      ...(nameBubbleAddedRef.current ? [] : [{ id: `child-${Date.now()}`, role: 'child' as const, text: name }]),
      { id: `sys-${Date.now()}`, role: 'system' as const, text: greeting },
    ])
    speakAndThen(greeting, () => {
      setConversationState('idle')
    })
  }
  function applyDreamAnalysis(result: DreamAnalysis) {
    setDreamAnalysis(result)
    setSelectedDreamRole(result.possible_roles.find((option) => option.label === result.role)?.label ?? result.possible_roles[0]?.label ?? '')
    setCustomDreamRole('')
    setDream({ role: result.role, roleIcon: result.role_icon, scene: result.scene, quote: result.quote || '我想继续探索自己喜欢的事情。', accent: result.accent })
  }
  async function analyzeConversation(answers: DreamResponse[], activeSessionId: string | null) {
    setView('analyzing')
    let result: DreamAnalysis
    const mayUseOnlineModel = globalSettings.llmProvider !== 'template' && onlineTextConsent
    if (activeSessionId && (globalSettings.llmProvider === 'template' || mayUseOnlineModel)) {
      try {
        result = await analyzeDream(activeSessionId, answers, mayUseOnlineModel)
        setApiStatus('connected')
      } catch {
        result = createLocalDreamAnalysis(answers, 'template_fallback')
        setApiStatus('local')
      }
    } else {
      result = createLocalDreamAnalysis(answers, mayUseOnlineModel ? 'template_fallback' : 'template')
    }
    applyDreamAnalysis(result)
    setView('dream-review')
    speak('我把刚刚聊到的想法整理好了，我们一起看看哪个方向最像你。')
  }
  async function answerQuestion(answer: string, source: 'voice' | 'choice' = 'choice') {
    stopVoice(); setVoiceError(''); setDream(dreamPresets[answer] ?? dream)
    const nextTurn: ConversationTurn = { id: `${Date.now()}-${conversationTurns.length}`, questionIndex, question: currentQuestion.label, answer: answer.trim(), source }
    const nextTurns = [...conversationTurns, nextTurn]
    setConversationTurns(nextTurns)
    const isLastQuestion = questionIndex >= questions.length - 1
    if (isLastQuestion) setView('analyzing')
    const activeSessionId = sessionId ?? await ensureSession()
    if (activeSessionId) void addResponse(activeSessionId, { question_id: `q${questionIndex + 1}`, text: answer, source }).catch(() => setApiStatus('local'))
    if (!isLastQuestion) window.setTimeout(() => setQuestionIndex((index) => index + 1), 750)
    else {
      const answers: DreamResponse[] = nextTurns.map((turn) => ({
        question_id: `q${turn.questionIndex + 1}`,
        text: turn.answer,
        source: turn.source,
      }))
      void analyzeConversation(answers, activeSessionId)
    }
  }
  function confirmDreamDirection() {
    if (!dreamAnalysis) return
    const role = customDreamRole.trim() || selectedDreamRole || dreamAnalysis.role
    const preset = Object.values(dreamPresets).find((candidate) => candidate.role === role)
    setDream({
      role,
      roleIcon: preset?.roleIcon ?? dreamAnalysis.role_icon,
      scene: preset?.scene ?? dreamAnalysis.scene,
      quote: dreamAnalysis.quote || '我想继续探索自己喜欢的事情。',
      accent: preset?.accent ?? dreamAnalysis.accent,
    })
    setView('photo')
    speak(`好的，我们就来想象一下${role}。`)
  }
  function localConversationResult(text: string, history: DreamResponse[]): ConversationTurnResult {
    const previousText = history.length ? history[history.length - 1].text.trim() : ''
    const confirmation = isConfirmationText(text)

    if (refusalPattern.test(text)) {
      return dreamTurnResult({ reply: '没关系，我们慢慢想。你喜欢帮助谁，或者喜欢做什么呢？', intent: 'unknown', follow_up_question: '你喜欢帮助谁，或者喜欢做什么呢？', confidence: .15 })
    }
    if (negativeRolePattern.test(text)) {
      return dreamTurnResult({ reply: '没关系，我们换一个想想。你最喜欢做什么，或者想帮助谁呀？', intent: 'unknown', follow_up_question: '你最喜欢做什么，或者想帮助谁呀？', confidence: .2 })
    }
    // Tier 1: an explicit role name said by the child → proceed to generate.
    const explicit = matchDreamRole(text)
    if (explicit) {
      const [, role, action, scene] = explicit
      return dreamTurnResult({
        reply: `哇，你想当${role}呀！`, intent: 'role', role, action, scene, confidence: .88,
        ready_to_generate: true, needs_follow_up: false, image_prompt: `${role}，${action}，场景是${scene}`,
      })
    }
    // Tier 1b: "养一只老鼠 / 照顾小猫 / 种花" describes a role even without the
    // role word, so map the meaning instead of echoing the child's sentence.
    const careHint = confirmation ? undefined : careRoleHint(text)
    if (careHint) {
      return dreamTurnResult({ reply: '我听到啦！', role: careHint.role, follow_up_question: careHint.question, confidence: .55 })
    }
    // Tier 2: an action or interest hint → ask one gentle confirmation question.
    const hint = confirmation ? undefined : matchDreamHint(text)
    if (hint) {
      const [, role, question] = hint
      return dreamTurnResult({ reply: '我听到啦！', role, follow_up_question: question, confidence: .5 })
    }
    // Tier 3: the child confirms what the previous turn suggested.
    if (confirmation && previousText) {
      const previousCare = careRoleHint(previousText)
      const role = previousCare?.role ?? matchDreamHint(previousText)?.[1] ?? ''
      if (role) {
        const details = dreamRoleDetails(role)
        return dreamTurnResult({
          reply: `好呀，那我们就来想象一下${role}！`, intent: 'role', role, action: details.action, scene: details.scene,
          confidence: .8, ready_to_generate: true, needs_follow_up: false,
          image_prompt: `${role}，${details.action}，场景是${details.scene}`,
        })
      }
      const previousPhrase = looksLikeDream(previousText) ? cleanDreamPhrase(previousText) : ''
      if (previousPhrase.length >= 2 && previousPhrase.length <= 12) {
        const details = dreamRoleDetails(previousPhrase)
        return dreamTurnResult({
          reply: `好呀，那我们就来想象一下「${previousPhrase}」！`, intent: 'role', role: previousPhrase,
          action: details.action, scene: details.scene, confidence: .8, ready_to_generate: true, needs_follow_up: false,
          image_prompt: `${previousPhrase}，${details.action}，场景是${details.scene}`,
        })
      }
    }
    // Tier 3b: a dream we have no word for → confirm it in the child's own words.
    if (looksLikeDream(text)) {
      const phrase = cleanDreamPhrase(text)
      if (phrase.length >= 2 && phrase.length <= 12) {
        const details = dreamRoleDetails(phrase)
        if (confirmation && previousText) {
          return dreamTurnResult({
            reply: `好呀，那我们就来想象一下「${phrase}」！`, intent: 'role', role: phrase,
            action: details.action, scene: details.scene, confidence: .8, ready_to_generate: true, needs_follow_up: false,
            image_prompt: `${phrase}，${details.action}，场景是${details.scene}`,
          })
        }
        return dreamTurnResult({ reply: '我听到啦！', role: phrase, follow_up_question: `你想做的是「${phrase}」，对吗？`, confidence: .45 })
      }
    }
    // Tier 4: nothing concrete. After two rounds stop looping and draw a card.
    if (history.length >= 2) {
      const details = dreamRoleDetails('梦想探索家')
      return dreamTurnResult({
        reply: '我先把你想到的这些画成一张梦想卡，好吗？', intent: 'role', role: '梦想探索家',
        action: details.action, scene: details.scene, confidence: .4, ready_to_generate: true, needs_follow_up: false,
        image_prompt: `梦想探索家，${details.action}，场景是${details.scene}`,
      })
    }
    if (!text.trim() || ['不知道', '我不知道', '不想说'].includes(text.trim())) {
      return dreamTurnResult({ reply: '没关系，我们慢慢想。你喜欢帮助谁，或者喜欢做什么呢？', intent: 'unknown', follow_up_question: '你喜欢帮助谁，或者喜欢做什么呢？', confidence: .15 })
    }
    return dreamTurnResult({ reply: '听起来很有趣呀！', follow_up_question: '你想变成什么样子的人呢？', confidence: .2 })
  }
  function applyAdaptiveDream(result: ConversationTurnResult, childText: string) {
    const role = result.role?.trim() || '梦想探索家'
    const visuals = roleVisual(role)
    setAdaptiveResult(result)
    setDream({
      role,
      roleIcon: visuals.roleIcon,
      scene: result.scene?.trim() || '一座充满奇妙发现的未来乐园',
      quote: childText.trim() || '我想继续探索自己喜欢的事情。',
      accent: visuals.accent,
      action: result.action?.trim() || '',
    })
  }
  async function answerAdaptiveTurn(text: string, source: 'voice' | 'choice' = 'voice') {
    const trimmed = text.trim()
    if (!trimmed) return
    if (nameStage === 'ask') { handleNameAnswer(trimmed); return }
    if (adaptiveTurnInFlightRef.current || conversationState === 'thinking' || conversationState === 'replying') return
    adaptiveTurnInFlightRef.current = true
    stopVoice(); setVoiceError(''); setConversationState('thinking')
    const nextAnswer: DreamResponse = { question_id: `turn-${adaptiveTurns.length + 1}`, text: trimmed, source }
    const nextTurns = [...adaptiveTurns, nextAnswer]
    setAdaptiveTurns(nextTurns)
    setConversationTurns((current) => [...current, {
      id: `${Date.now()}-${current.length}`,
      questionIndex: current.length,
      question: '梦想聊天',
      answer: trimmed,
      source,
    }])
    setChatMessages((current) => [...current, { id: `child-${Date.now()}`, role: 'child', text: trimmed }])
    const activeSessionId = sessionId ?? await ensureSession()
    if (activeSessionId) void addResponse(activeSessionId, nextAnswer).catch(() => setApiStatus('local'))
    try {
      // Always keep a local interpretation available. It prevents a partial or
      // unavailable online response from losing an obvious occupation such as
      // “开飞机、修飞机”.
      const localResult = localConversationResult(trimmed, adaptiveTurns)
      let result = localResult
      const mayUseOnlineModel = globalSettings.llmProvider !== 'template' && onlineTextConsent
      if (activeSessionId && (globalSettings.llmProvider === 'template' || mayUseOnlineModel)) {
        try {
          // Send the previous turns only: the backend pairs them with the
          // guide's last question so it can resolve answers like "是的".
          const onlineResult = await analyzeConversationTurn(
            activeSessionId,
            trimmed,
            adaptiveTurns,
            mayUseOnlineModel,
            adaptiveResult?.follow_up_question ?? '',
          )
          result = onlineResult
          setApiStatus('connected')
          if (localResult.ready_to_generate && (!onlineResult.role || !onlineResult.ready_to_generate)) {
            result = localResult
          }
          // Only fall back to the local confirmation question when the online
          // result understood nothing at all; otherwise the model's wording is
          // better than the canned sentence.
          if (localResult.needs_follow_up && localResult.role && !onlineResult.role) {
            result = localResult
          }
        } catch {
          setApiStatus('local')
        }
      }
      if (result.ready_to_generate && !result.needs_follow_up) {
        applyAdaptiveDream(result, trimmed)
        setConversationState('generating')
        const sysText = `${result.reply}我来把你的想法画出来。`
        setChatMessages((current) => [...current, { id: `sys-${Date.now()}`, role: 'system', text: sysText }])
        speakAndThen(sysText, () => {
          setConversationState('completed')
          setView((current) => current === 'interview' ? 'photo' : current)
        })
        return
      }
      setAdaptiveResult(result)
      setConversationState('replying')
      const followUp = (result.follow_up_question ?? '').trim()
      const replyText = (result.reply ?? '').trim()
      const sysReply = followUp && replyText && !replyText.includes(followUp)
        ? `${replyText} ${followUp}`
        : (replyText || followUp || '你还想告诉我什么呢？')
      setChatMessages((current) => [...current, { id: `sys-${Date.now()}`, role: 'system', text: sysReply }])
      speakAndThen(sysReply, () => {
        if (view !== 'interview') return
        // Wait for a manual tap on the microphone instead of opening it right
        // after the guide finishes speaking.
        setConversationState('idle')
      })
    } catch {
      setConversationState('idle')
      setVoiceError('我刚才没有整理好这句话，请再说一次。')
    } finally {
      adaptiveTurnInFlightRef.current = false
    }
  }
  async function transcribeCapturedAudio(audio: Blob) {
    if (!audio.size) {
      setIsTranscribing(false); setVoiceError('没有录到声音。请再试一次，或直接点选答案。')
      return
    }
    const controller = new AbortController()
    transcriptionAbortRef.current = controller
    try {
      const result = await transcribeAudio(audio, controller.signal)
      if (controller.signal.aborted) return
      transcriptionAbortRef.current = null
      setIsTranscribing(false); setVoiceError('')
      handleRecognizedText(result.text)
    } catch (error) {
      if (controller.signal.aborted) return
      transcriptionAbortRef.current = null
      const reason = error instanceof Error ? error.message : ''
      const message = reason === 'no_speech'
        ? '这次没有听清。请靠近麦克风再说一次，或直接点选答案。'
        : reason === 'empty_audio'
          ? '没有录到声音。请确认麦克风正常，再试一次或直接点选答案。'
        : reason === 'whisper_unavailable'
          ? '本地 Whisper 模型暂不可用。首次使用需要下载模型，请检查网络或稍后重试。'
          : reason === 'whisper_dependency_missing'
            ? '本地 Whisper 组件未安装。请重新构建并启动后端服务。'
            : reason === 'audio_too_large'
              ? '录音时间太长。请缩短后重试，或直接点选答案。'
          : '本地语音识别失败。请检查麦克风和服务状态，或直接点选答案。'
      voiceActiveRef.current = false
      setIsListening(false); setIsTranscribing(false); setVoiceError(message)
    }
  }

  function finishRecording() {
    if (browserSilenceTimerRef.current) window.clearTimeout(browserSilenceTimerRef.current)
    if (voiceMonitorTimerRef.current) window.clearInterval(voiceMonitorTimerRef.current)
    if (globalSettings.sttProvider === 'browser') {
      const recognition = browserRecognitionRef.current
      if (!recognition) return
      voiceActiveRef.current = false
      browserStopRequestedRef.current = true
      if (voiceTimeoutRef.current) window.clearTimeout(voiceTimeoutRef.current)
      if (browserRestartTimerRef.current) window.clearTimeout(browserRestartTimerRef.current)
      setIsListening(false); setIsTranscribing(true); setVoiceError('正在整理识别结果…')
      try { recognition.stop() } catch { completeBrowserRecognition() }
      return
    }
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    voiceActiveRef.current = false
    if (voiceTimeoutRef.current) window.clearTimeout(voiceTimeoutRef.current)
    transcribeWhenStoppedRef.current = true
    setIsListening(false); setIsTranscribing(true); setVoiceError('正在使用本机 Whisper 识别…')
    recorder.stop()
  }

  function completeBrowserRecognition() {
    browserStopRequestedRef.current = false
    browserRecognitionRef.current = null
    if (browserSilenceTimerRef.current) window.clearTimeout(browserSilenceTimerRef.current)
    if (voiceTimeoutRef.current) window.clearTimeout(voiceTimeoutRef.current)
    setIsListening(false); setIsRecording(false); setIsTranscribing(false)
    const transcript = browserTranscriptRef.current.trim()
    browserTranscriptRef.current = ''
    if (transcript) handleRecognizedText(transcript)
    else setVoiceError('这次没有听清。请再试一次，或直接点选答案。')
  }

  function handleRecognizedText(text: string) {
    if (view === 'future') {
      setFutureInput(text)
      setVoiceError('')
      void answerFutureSelf(text)
    } else if (view === 'interview') {
      void answerAdaptiveTurn(text, 'voice')
    } else {
      void answerQuestion(text, 'voice')
    }
  }

  async function startVoiceAnswer() {
    if (isRecording) { finishRecording(); return }
    if (isTranscribing) return
    if (isListening) { stopVoice(); return }
    if (globalSettings.sttProvider === 'browser') {
      const Recognition = browserRecognitionConstructor()
      if (!Recognition) {
        setVoiceError('当前浏览器没有可用的语音识别功能。请改用本地 Whisper，或直接点选答案。')
        return
      }
      const recognition = new Recognition()
      recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1
      browserRecognitionRef.current = recognition
      browserTranscriptRef.current = ''
      browserStopRequestedRef.current = false
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (result.isFinal) {
            browserTranscriptRef.current += result[0].transcript
            if (browserSilenceTimerRef.current) window.clearTimeout(browserSilenceTimerRef.current)
            browserSilenceTimerRef.current = window.setTimeout(() => {
              if (voiceActiveRef.current && browserTranscriptRef.current.trim()) finishRecording()
            }, 1600)
          }
        }
      }
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' && (voiceActiveRef.current || browserStopRequestedRef.current)) return
        if (event.error === 'aborted' && browserStopRequestedRef.current) return
        voiceActiveRef.current = false
        browserStopRequestedRef.current = false
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? '浏览器没有获得麦克风或语音识别权限。请检查权限，或切换到本地 Whisper。'
          : '浏览器语音识别暂时不可用。请重试、切换到本地 Whisper，或直接点选答案。'
        setIsListening(false); setIsRecording(false); setIsTranscribing(false); setVoiceError(message)
      }
      recognition.onend = () => {
        if (voiceActiveRef.current && !browserStopRequestedRef.current) {
          browserRestartTimerRef.current = window.setTimeout(() => {
            if (!voiceActiveRef.current || browserRecognitionRef.current !== recognition) return
            try { recognition.start() } catch { /* onend will retry after the next segment */ }
          }, 250)
          return
        }
        if (browserStopRequestedRef.current) {
          completeBrowserRecognition()
        } else {
          browserRecognitionRef.current = null
          setIsListening(false); setIsRecording(false)
        }
      }
      try {
        recognition.start()
        voiceActiveRef.current = true
        setIsListening(true); setIsRecording(true); setVoiceError('我在听你说。说完后会自动识别，也可以点一下小麦克风。')
        voiceTimeoutRef.current = window.setTimeout(finishRecording, 15000)
      } catch {
        browserRecognitionRef.current = null
        voiceActiveRef.current = false
        setIsListening(false); setIsRecording(false)
        setVoiceError('浏览器语音识别启动失败。请重试或切换到本地 Whisper。')
      }
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError('当前浏览器不支持录音。请更新浏览器，或直接点选答案。')
      return
    }

    window.speechSynthesis?.cancel()
    setVoiceError('正在打开麦克风…')
    setIsListening(true); voiceActiveRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!voiceActiveRef.current) { stream.getTracks().forEach((track) => track.stop()); return }
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined)
      audioStreamRef.current = stream
      recorderRef.current = recorder
      audioChunksRef.current = []
      transcribeWhenStoppedRef.current = false
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data) }
      recorder.onerror = () => {
        transcribeWhenStoppedRef.current = false
        stopVoice()
        setVoiceError('录音遇到问题。请重新尝试，或直接点选答案。')
      }
      recorder.onstop = () => {
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const shouldTranscribe = transcribeWhenStoppedRef.current
        transcribeWhenStoppedRef.current = false
        if (voiceMonitorTimerRef.current) window.clearInterval(voiceMonitorTimerRef.current)
        const audioContext = audioContextRef.current
        audioContextRef.current = null
        audioAnalyserRef.current = null
        speechDetectedRef.current = false
        void audioContext?.close().catch(() => undefined)
        audioChunksRef.current = []
        audioStreamRef.current?.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null; recorderRef.current = null; setIsRecording(false)
        if (shouldTranscribe) void transcribeCapturedAudio(audio)
      }
      recorder.start(250)
      try {
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 512
        audioContext.createMediaStreamSource(stream).connect(analyser)
        audioContextRef.current = audioContext
        audioAnalyserRef.current = analyser
        speechDetectedRef.current = false
        const buffer = new Uint8Array(analyser.fftSize)
        let quietSince = 0
        voiceMonitorTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(buffer)
          let sum = 0
          for (const value of buffer) {
            const normalized = (value - 128) / 128
            sum += normalized * normalized
          }
          const volume = Math.sqrt(sum / buffer.length)
          if (volume > .035) {
            speechDetectedRef.current = true
            quietSince = 0
          } else if (speechDetectedRef.current) {
            if (!quietSince) quietSince = performance.now()
            if (performance.now() - quietSince > 1400) finishRecording()
          }
        }, 180)
      } catch {
        // Some browsers expose MediaRecorder without Web Audio; the max timer remains as fallback.
      }
      setIsRecording(true); setVoiceError('我在听你说。安静一会儿后会自动识别。')
      voiceTimeoutRef.current = window.setTimeout(finishRecording, 12000)
    } catch {
      voiceActiveRef.current = false
      setIsListening(false)
      setVoiceError('无法打开麦克风。请允许浏览器使用麦克风，或直接点选答案。')
    }
  }
  function chooseRenderMode(mode: 'quality' | 'fast') {
    setRenderMode(mode)
    try { window.localStorage.setItem('future-dream-render-mode', mode) } catch { /* ignore quota errors */ }
  }
  async function generateCard() {
    if (generationTimerRef.current) window.clearTimeout(generationTimerRef.current)
    setGenerationError('')
    setGeneratedImageUrl(null)
    if (sessionId) {
      try {
        const job = await startDreamCardGeneration(sessionId, {
          role: dream.role,
          action: dream.action ?? '',
          scene: dream.scene,
          quote: dream.quote,
          style,
          render_mode: renderMode,
          age_mode: photoAgeMode,
          allow_online_image: globalSettings.imageProvider === 'siliconflow' && onlineImageConsent,
          allow_child_photo: globalSettings.imageProvider === 'siliconflow' && onlinePhotoConsent,
          reference_image: globalSettings.imageProvider === 'siliconflow' && photoMode === 'photo' && onlinePhotoConsent ? photoPreview ?? undefined : undefined,
          include_character: photoMode !== 'none',
          gender: childGender || undefined,
        })
        const completedJob = await waitForGeneration(job.id)
        if (completedJob.status === 'completed') {
          setGeneratedImageUrl(completedJob.result?.image_url ?? null)
          setApiStatus('connected')
          setView('card')
          return
        }
        setGenerationError('图片服务暂时没有返回作品，下面先显示本地梦想卡。')
      } catch (error) {
        const reason = error instanceof Error ? error.message : ''
        setGenerationError(reason === 'image_consent_required'
          ? '需要先由老师或家长确认，才能把梦想文字发送到硅基流动生成图片。'
          : reason === 'child_photo_consent_required'
            ? '需要先由老师或家长单独确认，才能把本张照片发送给硅基流动绘制职业形象。'
            : reason === 'invalid_reference_image'
              ? '照片格式暂不支持，请重新拍摄后再试。'
          : reason === 'siliconflow_api_key_missing'
            ? '还没有配置硅基流动 API Key。请打开全局设置完成配置。'
            : '图片服务暂时不可用，下面先显示本地梦想卡。')
        setApiStatus('local')
      }
    } else if (globalSettings.imageProvider === 'siliconflow') {
      setGenerationError('本机 API 服务未连接，无法调用硅基流动；下面先显示本地梦想卡。')
    }
    generationTimerRef.current = window.setTimeout(() => setView('card'), 1500)
  }
  function continueFromPhoto() {
    if (globalSettings.imageProvider === 'siliconflow' && photoMode === 'photo' && photoPreview && !onlinePhotoConsent) return
    stopCamera(); setView('generating'); setPrivacyMessage('生成中的临时素材会在本次体验结束后清理'); void generateCard()
  }
  function regenerate() { setView('generating'); void generateCard() }
  function downloadCard() {
    if (generatedImageUrl) {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 1200
        canvas.height = 1500
        const context = canvas.getContext('2d')
        if (!context) return
        context.fillStyle = '#273a3d'
        context.fillRect(0, 0, canvas.width, canvas.height)
        // Fit the whole generated image inside the portrait card (contain)
        // so the person is never cropped out, regardless of aspect ratio.
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
        context.fillStyle = 'rgba(30, 44, 43, 0.3)'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#ffffff'
        context.font = '32px sans-serif'
        context.fillText('未来梦想剧场', 80, 86)
        context.font = 'bold 58px sans-serif'
        context.fillText(`想象中的未来：${dream.role}`, 80, 165, 1040)
        context.font = '30px sans-serif'
        context.fillText(dream.scene, 80, 225, 1040)
        context.fillStyle = 'rgba(255, 253, 248, 0.92)'
        context.fillRect(0, 1120, canvas.width, 380)
        context.fillStyle = '#263b3a'
        context.font = 'bold 36px sans-serif'
        context.fillText(dream.role, 80, 1200, 1040)
        context.font = '30px sans-serif'
        context.fillText(`“${dream.quote}”`, 80, 1290, 1040)
        context.font = '28px sans-serif'
        context.fillText(dream.scene, 80, 1380, 1040)
        savePng()
        function savePng() {
          canvas.toBlob((blob) => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `future-dream-${sessionNumber}.png`
            anchor.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setPrivacyMessage('梦想卡已下载到本机')
          }, 'image/png')
        }
      }
      image.onerror = () => setGenerationError('无法读取生成图片，请稍后重试。')
      image.src = generatedImageUrl
      return
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><rect width="1200" height="1500" fill="#f6f0e6"/><circle cx="950" cy="230" r="100" fill="#ffd27d"/><path d="M0 1110 Q260 930 500 1080 T1200 1010 V1500 H0Z" fill="#b8d9cd"/><text x="90" y="110" font-family="Arial" font-size="32" fill="#53645d">未来梦想剧场</text><text x="90" y="205" font-family="Arial" font-size="60" font-weight="700" fill="#202d36">想象中的未来：${escapeXmlText(dream.role)}</text><text x="90" y="1330" font-family="Arial" font-size="32" fill="#202d36">“${escapeXmlText(dream.quote)}”</text><text x="90" y="1400" font-family="Arial" font-size="30" fill="#53645d">${escapeXmlText(dream.scene)}</text><text x="850" y="870" font-size="170">${escapeXmlText(dream.roleIcon)}</text></svg>`
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `future-dream-${sessionNumber}.svg`; anchor.click(); URL.revokeObjectURL(url); setPrivacyMessage('梦想卡已下载到本机')
  }
  async function downloadPoster() {
    if (!classRoster.length) return
    const cols = classRoster.length <= 1 ? 1 : classRoster.length <= 4 ? 2 : classRoster.length <= 9 ? 3 : 4
    const rows = Math.ceil(classRoster.length / cols)
    const cellW = 520, cellH = 640, gap = 40, pad = 60, headerH = 240, footerH = 110
    const canvas = document.createElement('canvas')
    canvas.width = pad * 2 + cols * cellW + (cols - 1) * gap
    canvas.height = headerH + rows * cellH + (rows - 1) * gap + pad + footerH
    const context = canvas.getContext('2d')
    if (!context) return
    const accentColors: Record<string, string> = { sage: '#d7e8d0', coral: '#f8e0d7', mint: '#d7ebe3', blue: '#deebf1', violet: '#e6ddf2' }
    context.fillStyle = '#fbf8f3'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#3c807b'
    context.font = 'bold 30px sans-serif'
    context.fillText('未来梦想剧场 · 班级海报', pad, pad + 10)
    context.fillStyle = '#1f2e36'
    context.font = 'bold 76px sans-serif'
    context.fillText('我们的梦想', pad, pad + 100)
    context.fillStyle = '#6e7a78'
    context.font = '28px sans-serif'
    context.fillText(`${classRoster.length} 位小朋友的梦想角色 · ${new Date().toLocaleDateString('zh-CN')}`, pad, pad + 155)
    const images = await Promise.all(classRoster.map((entry) => entry.imageUrl
      ? new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = entry.imageUrl as string
        })
      : Promise.resolve(null)))
    classRoster.forEach((entry, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = pad + col * (cellW + gap)
      const y = headerH + row * (cellH + gap)
      context.fillStyle = '#fffdf9'
      roundRect(context, x, y, cellW, cellH, 28)
      context.fill()
      context.strokeStyle = '#e7e2d8'
      context.lineWidth = 2
      context.stroke()
      const artX = x + 24, artY = y + 24, artW = cellW - 48, artH = 380
      context.fillStyle = accentColors[entry.accent] ?? '#deebf1'
      roundRect(context, artX, artY, artW, artH, 20)
      context.fill()
      const img = images[index]
      if (img) {
        const scale = Math.min(artW / img.width, artH / img.height)
        const w = img.width * scale, h = img.height * scale
        context.save()
        roundRect(context, artX, artY, artW, artH, 20)
        context.clip()
        context.drawImage(img, artX + (artW - w) / 2, artY + (artH - h) / 2, w, h)
        context.restore()
      } else {
        context.font = '150px sans-serif'
        context.textAlign = 'center'
        context.fillText(entry.roleIcon, artX + artW / 2, artY + artH / 2 + 52)
        context.textAlign = 'left'
      }
      context.fillStyle = '#1f2e36'
      context.font = 'bold 46px sans-serif'
      context.fillText(entry.name, x + 32, y + 470, cellW - 64)
      context.fillStyle = '#3c807b'
      context.font = 'bold 34px sans-serif'
      context.fillText(`未来的${entry.role}`, x + 32, y + 530, cellW - 64)
      context.fillStyle = '#6e7a78'
      context.font = '26px sans-serif'
      const quote = entry.quote.length > 18 ? `${entry.quote.slice(0, 18)}…` : entry.quote
      context.fillText(`“${quote}”`, x + 32, y + 585, cellW - 64)
    })
    context.fillStyle = '#929b95'
    context.font = '24px sans-serif'
    context.fillText('每个梦想，都值得被看见 · 这是一场想象，不是对未来的预测', pad, canvas.height - 45)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `class-dream-poster-${Date.now()}.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setPrivacyMessage('班级海报已下载到本机')
    }, 'image/png')
  }
  function startFutureSelf() {
    setView('future')
    setFutureReply('')
    setFutureInput('')
    setFuturePending(false)
    setFutureTurns([])
    setVoiceError('')
    speak(`你好，我是想象中的未来的你。你想和未来的${dream.role}聊些什么？`)
  }
  async function answerFutureSelf(messageOverride?: string) {
    const message = (messageOverride ?? futureInput).trim()
    if (!message || futurePending) return
    setFuturePending(true)
    setFutureInput('')
    setVoiceError('')
    setFutureTurns((turns) => [...turns, { role: 'user', text: message }])
    let reply = '这个想法真有趣。我们可以一起想想，从哪一步开始。'
    if (sessionId) {
      try {
        const response = await askFutureSelf(
          sessionId,
          message,
          globalSettings.llmProvider !== 'template' && onlineTextConsent,
          { role: dream.role, scene: dream.scene, history: futureTurns },
        )
        reply = response.text
        setApiStatus('connected')
      } catch {
        setApiStatus('local')
      }
    }
    setFutureReply(reply)
    setFutureTurns((turns) => [...turns, { role: 'assistant', text: reply }])
    setFuturePending(false)
    speak(reply)
  }
  async function snapshotRosterImage(url: string): Promise<string | null> {
    // Copy the generated image into an in-memory data URL: the backend clears
    // session assets when the next child starts, but the class poster still
    // needs every child's picture. Images stay in browser memory only.
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('image_load_failed'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 480 / (image.width || 480))
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.82)
    } catch {
      return null
    }
  }
  function finishSession() {
    stopVoice(); window.speechSynthesis?.cancel(); setView('complete'); setPrivacyMessage('你可以下载作品，也可以删除本次体验的全部临时数据')
    if (mode === 'classroom') {
      const entryImageSource = generatedImageUrl
      const entry: RosterEntry = {
        id: `child-${sessionNumber}-${Date.now()}`,
        name: childName || `第 ${sessionNumber} 位小朋友`,
        gender: childGender,
        role: dream.role,
        roleIcon: dream.roleIcon,
        quote: dream.quote,
        accent: dream.accent,
        imageUrl: null,
        sessionNumber,
      }
      if (entryImageSource) {
        void snapshotRosterImage(entryImageSource).then((snapshot) => {
          setClassRoster((current) => [...current, { ...entry, imageUrl: snapshot }])
        })
      } else {
        setClassRoster((current) => [...current, entry])
      }
    }
  }
  function clearSession(nextChild = false) {
    stopCamera(); stopVoice(); window.speechSynthesis?.cancel()
    if (sessionId) void (nextChild ? clearRemoteSession(sessionId) : deleteRemoteSession(sessionId)).catch(() => undefined)
    setSessionId(null); setApiStatus('local'); setPhotoPreview(null); setGeneratedImageUrl(null); setGenerationError(''); setOnlineImageConsent(false); setOnlinePhotoConsent(false); setPhotoMode('cartoon'); setQuestionIndex(0); setConversationTurns([]); setAdaptiveTurns([]); setAdaptiveResult(null); setConversationState('idle'); setShowFallbackChoices(false); setDreamAnalysis(null); setSelectedDreamRole(''); setCustomDreamRole(''); setDream(defaultDream); setFutureReply(''); setFutureInput(''); setFuturePending(false); setFutureTurns([]); setCameraError(''); setVoiceError(''); setPrivacyMessage('当前会话数据仅用于本次体验')
    setChildName(''); setChildGender(''); setNameInput(''); setNameStage('ask')
    if (!nextChild) setClassRoster([])
    if (nextChild) {
      setSessionNumber((value) => value + 1)
      setOnlineTextConsent(false)
       if (globalSettings.llmProvider !== 'template' || globalSettings.imageProvider === 'siliconflow') setView('setup')
      else { setView('welcome'); speak('下一位小朋友，准备好了吗？') }
    } else setView('entry')
  }
  function goBack() {
    stopVoice()
    const previous: Partial<Record<View, View>> = { setup: 'entry', device: 'setup', welcome: 'device', interview: 'welcome', 'dream-review': 'interview', photo: 'interview', card: 'photo', future: 'card', poster: 'complete' }
    const previousView = previous[view]; if (previousView) setView(previousView)
  }

  return <div className="app-shell">
      {settingsOpen && <div className="settings-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
        <section className="global-settings-panel" role="dialog" aria-modal="true" aria-labelledby="global-settings-title">
          <div className="global-settings-heading">
            <div><span className="eyebrow"><span />全局配置</span><h2 id="global-settings-title">应用设置</h2><p>这些选项会用于之后的体验。</p></div>
            <button className="icon-button settings-close" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
          </div>
          <div className="global-settings-body">
            <section className="global-settings-section">
              <h3>语音识别</h3>
              <label className="field-label">识别方式
                <span className="select-wrap"><select value={settingsDraft.sttProvider} onChange={(event) => setSettingsDraft((current) => ({ ...current, sttProvider: event.target.value as GlobalSettings['sttProvider'] }))}><option value="local_whisper">本地 Whisper（推荐）</option><option value="browser">浏览器自带识别</option></select><ChevronDown size={16} /></span>
              </label>
              {settingsDraft.sttProvider === 'local_whisper'
                ? <><label className="field-label settings-field-gap">Whisper 模型
                    <span className="select-wrap"><select value={settingsDraft.whisperModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, whisperModel: event.target.value as GlobalSettings['whisperModel'] }))}><option value="tiny">tiny · 更快、占用更少</option><option value="base">base · 推荐</option><option value="small">small · 识别更准确、占用更多</option></select><ChevronDown size={16} /></span>
                  </label><p className="settings-help">音频在本机服务处理。更换模型后首次识别时会下载模型文件。</p></>
                : <p className={'settings-notice ' + (browserRecognitionConstructor() ? '' : 'is-warning')}>{browserRecognitionConstructor() ? '使用浏览器语音识别。浏览器支持和隐私处理方式因版本而异；识别可能需要网络。' : '当前浏览器没有检测到 SpeechRecognition 支持。保存后仍可改用本地 Whisper 或点击选项。'}</p>}
            </section>
            <section className="global-settings-section">
              <h3>大模型对话</h3>
              <label className="field-label">对话服务
                <span className="select-wrap"><select value={settingsDraft.llmProvider} onChange={(event) => setSettingsDraft((current) => ({ ...current, llmProvider: event.target.value as GlobalSettings['llmProvider'] }))}><option value="template">内置模板（默认）</option><option value="openai_compatible">OpenAI 兼容 API</option><option value="siliconflow">硅基流动</option></select><ChevronDown size={16} /></span>
              </label>
              {settingsDraft.llmProvider === 'openai_compatible' && <div className="settings-api-fields">
                <label className="field-label">API 地址<input value={settingsDraft.openaiBaseUrl} onChange={(event) => setSettingsDraft((current) => ({ ...current, openaiBaseUrl: event.target.value }))} placeholder="https://api.openai.com/v1" /></label>
                <label className="field-label">模型名称<input value={settingsDraft.openaiModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, openaiModel: event.target.value }))} placeholder="gpt-4o-mini" /></label>
                <label className="field-label">API Key<input type="password" autoComplete="new-password" value={settingsDraft.openaiApiKey} onChange={(event) => { setClearSavedApiKey(false); setSettingsDraft((current) => ({ ...current, openaiApiKey: event.target.value })) }} placeholder={remoteApiKeyConfigured ? '已配置；留空表示保持不变' : '输入 API Key'} /></label>
                <p className="settings-help">密钥保存在运行本应用的后端配置文件中，未加密且不会返回浏览器。请只在自己控制的电脑或服务器上配置，并确认服务商的数据处理规则。</p>
                {remoteApiKeyConfigured && <button className="text-button settings-clear-key" onClick={() => { setClearSavedApiKey(true); setSettingsDraft((current) => ({ ...current, openaiApiKey: '' })) }}>{clearSavedApiKey ? '保存后将清除已保存的 API Key' : '清除已保存的 API Key'}</button>}
              </div>}
              <div className="settings-api-fields">
                <label className="field-label">硅基流动对话模型<input value={settingsDraft.siliconflowChatModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, siliconflowChatModel: event.target.value }))} placeholder="deepseek-ai/DeepSeek-V4.1-Flash" /></label>
                <label className="field-label">精细图片模型<input value={settingsDraft.siliconflowImageModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, siliconflowImageModel: event.target.value }))} placeholder="Tongyi-MAI/Z-Image" /></label>
                <label className="field-label">快速图片模型<input value={settingsDraft.siliconflowImageFastModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, siliconflowImageFastModel: event.target.value }))} placeholder="Tongyi-MAI/Z-Image-Turbo" /></label>
                <label className="field-label">照片参考模型<input value={settingsDraft.siliconflowImageEditModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, siliconflowImageEditModel: event.target.value }))} placeholder="Qwen/Qwen-Image-Edit-2509" /></label>
                <p className="settings-help">体验页的“精细绘本 / 快速卡通”会分别使用这两个模型；拍照模式固定使用照片参考模型。普通图片模型不会可靠地保留照片中的脸。</p>
                <label className="field-label">硅基流动 API Key<input type="password" autoComplete="new-password" value={settingsDraft.siliconflowApiKey} onChange={(event) => { setClearSavedSiliconFlowKey(false); setSettingsDraft((current) => ({ ...current, siliconflowApiKey: event.target.value })) }} placeholder={remoteSiliconFlowKeyConfigured ? '已配置；留空表示保持不变' : '输入 SiliconFlow API Key'} /></label>
                <p className="settings-help">同一个 Key 可用于对话和图片。密钥保存在本机后端配置文件中，未加密且不会返回浏览器；请只在自己控制的设备上配置。照片和原始录音不会上传。</p>
                {remoteSiliconFlowKeyConfigured && <button className="text-button settings-clear-key" onClick={() => { setClearSavedSiliconFlowKey(true); setSettingsDraft((current) => ({ ...current, siliconflowApiKey: '' })) }}>{clearSavedSiliconFlowKey ? '保存后将清除已保存的 Key' : '清除已保存的硅基流动 Key'}</button>}
              </div>
              {settingsDraft.llmProvider === 'template' && settingsDraft.imageProvider !== 'siliconflow' && <p className="settings-help">使用本地固定回复，不需要 API Key。</p>}
            </section>
            <section className="global-settings-section">
              <h3>语音、图片与数据</h3>
              <div className="settings-inline-row"><div><strong>语音播报</strong><small>使用浏览器中文语音合成</small></div><button className={'toggle-control compact-toggle ' + (settingsDraft.ttsEnabled ? 'active' : '')} onClick={() => setSettingsDraft((current) => ({ ...current, ttsEnabled: !current.ttsEnabled }))} aria-pressed={settingsDraft.ttsEnabled}><strong>{settingsDraft.ttsEnabled ? '开启' : '关闭'}</strong><span /></button></div>
              <label className="field-label settings-field-gap">图片生成服务
                <span className="select-wrap"><select value={settingsDraft.imageProvider} onChange={(event) => setSettingsDraft((current) => ({ ...current, imageProvider: event.target.value as GlobalSettings['imageProvider'] }))}><option value="mock">Mock 预览（默认）</option><option value="siliconflow">硅基流动图片生成</option></select><ChevronDown size={16} /></span>
              </label>
              <p className="settings-help">{settingsDraft.imageProvider === 'siliconflow' ? '使用硅基流动的图片模型生成真实插画，生成前会在体验页面征得老师或家长确认。' : '使用本地 Mock 预览，不会调用在线图片服务。'}</p>
              <label className="field-label settings-field-gap">临时会话保留时间
                <span className="select-wrap"><select value={settingsDraft.retentionMinutes} onChange={(event) => setSettingsDraft((current) => ({ ...current, retentionMinutes: Number(event.target.value) }))}><option value={5}>5 分钟</option><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>1 小时</option></select><ChevronDown size={16} /></span>
              </label>
            </section>
            {settingsError && <div className="settings-error" role="alert">{settingsError}</div>}
          </div>
          <div className="global-settings-actions"><button className="secondary-button" onClick={() => setSettingsOpen(false)}>取消</button><button className="primary-button" onClick={() => void saveSettings()} disabled={settingsSaving}>{settingsSaving ? '正在保存…' : '保存全局设置'}</button></div>
        </section>
      </div>}
    <header className="topbar"><div className="brand-lockup"><button className="brand-mark" aria-label="全局设置" title="全局设置" onClick={openGlobalSettings}><Sparkles size={21} /></button><div><p className="brand-name">未来梦想剧场</p><p className="brand-tagline">每个梦想，都值得被看见</p></div></div><div className="topbar-meta"><span className="session-pill"><span className="status-dot" />{mode === 'classroom' ? `课堂模式 · 第 ${sessionNumber} 位` : '家庭模式'}</span>{view !== 'entry' && <button className="icon-button" title="返回入口" onClick={() => clearSession(false)}><X size={18} /></button>}</div></header>
    <main className={`main-content view-${view}`}>
      {view !== 'entry' && view !== 'complete' && view !== 'poster' && <div className="journey-bar"><div className="journey-label"><span>当前步骤</span><strong>{statusLabel}</strong></div><div className="journey-progress" aria-label={`当前进度 ${progress}%`}><span style={{ width: `${Math.max(8, progress)}%` }} /></div><span className={`privacy-label ${apiStatus}`}><LockKeyhole size={14} />{apiStatus === 'connected' ? '本地服务已连接' : '离线也可体验'}</span></div>}
      {view === 'entry' && <section className="entry-layout"><div className="entry-copy"><div className="eyebrow"><span />儿童想象力体验</div><h1>说出一个梦想，<br /><em>看见未来的自己。</em></h1><p className="entry-description">和虚拟引导员聊一会儿，把孩子心里的想法变成一张独一无二的梦想卡。</p><div className="entry-actions"><button className="primary-button large" onClick={() => chooseMode('classroom')}><Mic size={19} />老师带孩子体验<ArrowRight size={18} /></button><button className="secondary-button large" onClick={() => chooseMode('family')}><Heart size={18} />家庭体验</button></div><div className="entry-trust"><div><ShieldCheck size={16} /><span>默认不保存原始照片和录音</span></div><div><Sparkles size={16} /><span>这是一场想象，不是对未来的预测</span></div></div></div><div className="entry-art"><img className="cover-image" src={coverSpace} alt="小朋友在太空中探索未来" /></div></section>}
      {view === 'setup' && <section className="content-section narrow-section">
        <div className="section-heading"><div><div className="eyebrow"><span />{mode === 'classroom' ? '课堂准备' : '家庭准备'}</div><h2>先把这场体验准备好</h2><p>可以直接使用默认设置，整个流程大约需要 3-5 分钟。</p></div><div className="heading-icon coral"><Settings2 size={22} /></div></div>
        <div className="settings-grid">
          <label className="field-label">年龄段<span className="select-wrap"><select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}><option>3-4 岁</option><option>5-6 岁</option><option>6 岁以上</option></select><ChevronDown size={16} /></span></label>
          <label className="field-label">本次主题<span className="select-wrap"><select value={theme} onChange={(event) => setTheme(event.target.value)}><option>自由想象</option><option>帮助别人</option><option>自然和动物</option><option>太空探险</option></select><ChevronDown size={16} /></span></label>
          <label className="field-label">图片风格<span className="select-wrap"><select value={style} onChange={(event) => setStyle(event.target.value)}><option>明亮插画</option><option>蜡笔画</option><option>纸张拼贴</option></select><ChevronDown size={16} /></span></label>
          <div className="field-label">未来自己语音<button className={'toggle-control ' + (voiceEnabled ? 'active' : '')} onClick={toggleVoiceEnabled} aria-pressed={voiceEnabled}><span /><strong>{voiceEnabled ? '开启' : '关闭'}</strong></button></div>
        </div>
        <div className="privacy-callout"><ShieldCheck size={18} /><div><strong>隐私默认保护</strong><p>访谈文字、录音和照片按不同用途处理；照片默认留在本机。只有单独勾选授权后，才会将照片发送给在线图片服务生成职业插画。临时会话会按设置自动清理。</p></div></div>
        <div className="warning-callout speech-disclosure"><Mic size={17} /><span>录音只发送到所选识别服务。使用本机 Whisper 时，音频在本机服务转写后立即删除；首次使用需要下载并缓存模型文件。</span></div>
        {globalSettings.llmProvider !== 'template' && <div className="online-model-callout"><LockKeyhole size={18} /><div>
          <strong>{onlineTextConsent ? '本次会使用在线大模型' : '在线大模型（可选）'}</strong>
          <p>{onlineTextConsent ? '勾选后，孩子的访谈和未来对话文字会发送给' + (globalSettings.llmProvider === 'siliconflow' ? '硅基流动' : '已配置的模型服务') + '，用于整理梦想和生成回复；这项授权不包含照片或原始录音。在线服务的数据处理和留存规则以服务商政策为准。' : '不勾选时将使用内置模板，孩子的文字回答不会发送到在线模型。'}</p>
          <label className="online-model-consent"><input type="checkbox" checked={onlineTextConsent} onChange={(event) => setOnlineTextConsent(event.target.checked)} /><span>{mode === 'classroom' ? '老师' : '家长或监护人'}已确认本次文字回答可以发送到该模型服务。</span></label>
        </div></div>}
        {globalSettings.imageProvider === 'siliconflow' && <div className="online-model-callout"><ImageIcon size={18} /><div>
          <strong>{onlineImageConsent ? '本次会使用硅基流动生成图片' : '在线图片生成需要确认'}</strong>
          <p>确认后，会将孩子选择的职业、场景描述和图片风格发送到硅基流动。拍摄的照片不会自动上传；如果希望把孩子的脸绘入职业插画，还需要在后续页面单独勾选照片授权。在线服务的数据处理和留存规则以服务商政策为准。</p>
          <label className="online-model-consent"><input type="checkbox" checked={onlineImageConsent} onChange={(event) => setOnlineImageConsent(event.target.checked)} /><span>{mode === 'classroom' ? '老师' : '家长或监护人'}已确认发送上述文字来生成图片。</span></label>
        </div></div>}
        <div className="section-footer">
          <button className="text-button" onClick={goBack}><ArrowLeft size={16} />返回</button>
          <button className="primary-button" onClick={beginDeviceCheck} disabled={globalSettings.imageProvider === 'siliconflow' && !onlineImageConsent}>检查设备并开始 <ArrowRight size={17} /></button>
        </div>
      </section>}
      {view === 'device' && <section className="content-section narrow-section"><div className="section-heading"><div><div className="eyebrow"><span />设备检查</div><h2>让我们听见，也看见</h2><p>设备只会在你选择使用时打开。摄像头和麦克风可以分别跳过。</p></div><div className="heading-icon mint"><Camera size={22} /></div></div><div className="device-grid"><div className="device-preview"><Camera size={26} /><span>摄像头权限检查</span><small>{cameraStatus === 'ready' ? '已连接' : cameraStatus === 'checking' ? '正在检查…' : cameraStatus === 'unavailable' ? '不可用；可选卡通形象' : '点击“检查设备”测试'}</small></div><div className="device-check-list"><div className={`device-row ${microphoneStatus === 'ready' ? 'ready' : ''}`}><span className="device-icon"><Mic size={18} /></span><div><strong>麦克风</strong><small>{microphoneStatus === 'ready' ? '已连接' : microphoneStatus === 'checking' ? '正在检查…' : microphoneStatus === 'unavailable' ? '不可用；仍可点选答案' : '点击“检查设备”测试'}</small></div><span className="device-status">{microphoneStatus === 'ready' && <CheckCircle2 size={18} />}</span></div><div className="device-row"><span className="device-icon"><Volume2 size={18} /></span><div><strong>扬声器</strong><small>{voiceEnabled ? '开启后会播放引导语音' : '语音播报已关闭'}</small></div></div><button className="secondary-button device-test" onClick={checkDevices} disabled={deviceStatus === 'checking'}><RefreshCw size={17} className={deviceStatus === 'checking' ? 'spin' : ''} />{deviceStatus === 'checking' ? '正在检查…' : '检查设备'}</button></div></div>{cameraError && <div className="warning-callout"><CircleHelp size={18} /><span>{cameraError}</span></div>}<div className="section-footer"><button className="text-button" onClick={goBack}><ArrowLeft size={16} />返回设置</button><button className="primary-button" onClick={startInterview}>开始体验 <ArrowRight size={17} /></button></div></section>}
      {view === 'welcome' && <section className="welcome-layout child-welcome-layout"><div className="guide-portrait"><div className="guide-face">✦</div><span className="guide-status"><span />准备好了</span></div><div className="welcome-copy"><div className="eyebrow"><span />你好呀</div><h2>我们一起<br /><em>想一想未来！</em></h2><p>小伙伴会问你一个问题。你想说什么，就说什么。</p><button className="primary-button large" onClick={beginChildConversation}><Mic size={19} />开始聊天 <ArrowRight size={18} /></button><button className="text-button" onClick={() => setView('setup')}><Settings2 size={15} />老师设置</button></div></section>}
      {view === 'interview' && <section className="content-section interview-section child-interview-section">
        <div className="chat-companion-bar">
          <div className="guide-face chat-guide-face">✦</div>
          <div className="chat-companion-info">
            <strong>梦想小伙伴</strong>
            <span className="chat-status-dot">{conversationState === 'thinking' ? '正在想一想…' : conversationState === 'speaking' ? '正在说话…' : conversationState === 'replying' ? '和你聊天中' : conversationState === 'generating' ? '准备画出来…' : '在线'}</span>
          </div>
        </div>
        <div className="chat-bubbles" ref={chatBubblesRef}>
          {chatMessages.map((msg) => <div className={`chat-bubble-row ${msg.role === 'system' ? 'row-system' : 'row-child'}`} key={msg.id}>
            {msg.role === 'system' && <div className="chat-avatar">✦</div>}
            <div className={`chat-bubble ${msg.role === 'system' ? 'bubble-system' : 'bubble-child'}`}>{msg.text}</div>
          </div>)}
          {conversationState === 'thinking' && <div className="chat-bubble-row row-system">
            <div className="chat-avatar">✦</div>
            <div className="chat-bubble bubble-system chat-typing-wrap"><span className="chat-typing"><i /><i /><i /></span></div>
          </div>}
        </div>
        <p className="listen-status child-listen-status">{isTranscribing ? (globalSettings.sttProvider === 'browser' ? '我在整理你说的话…' : 'Whisper 正在听清楚…') : isRecording ? '我在听你说，安静一会儿就会自动识别。' : conversationState === 'thinking' ? '小伙伴正在想一想…' : conversationState === 'speaking' ? '小伙伴正在说话…' : conversationState === 'generating' ? '我已经听懂你的梦想，正在准备下一步…' : conversationState === 'replying' ? '小伙伴正在和你聊…' : '轮到你说啦！点一下下面的小麦克风开始说话，也可以点选答案。'}</p>
        {voiceError && <div className="warning-callout voice-warning"><CircleHelp size={18} /><span>{voiceError}</span></div>}
        {nameStage === 'ask' && <div className="teacher-name-panel">
          <div className="teacher-name-row">
            <label className="field-label teacher-name-field">小朋友的名字
              <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} onBlur={() => { if (!childGender) maybeGuessGender(nameInput.trim()) }} maxLength={12} placeholder="老师输入或修改名字" />
            </label>
            <div className="gender-picker">
              <span className="gender-picker-label">{genderGuessing ? '正在按名字猜一猜…' : '男孩还是女孩？'}</span>
              <div className="gender-chips">
                <button type="button" className={'gender-chip' + (childGender === 'boy' ? ' active' : '')} onClick={() => setChildGender('boy')}>男孩</button>
                <button type="button" className={'gender-chip' + (childGender === 'girl' ? ' active' : '')} onClick={() => setChildGender('girl')}>女孩</button>
              </div>
            </div>
          </div>
          <p className="teacher-name-hint">孩子可以直接说名字；识别不准时老师帮忙输入。性别由大模型按名字猜测，可能猜错，老师可以改。名字只保存在本机内存中。</p>
          <button className="primary-button" onClick={confirmChildName} disabled={!nameInput.trim()}>确认名字，开始聊梦想 <ArrowRight size={16} /></button>
        </div>}
        {nameStage === 'done' && <button className="text-button child-help-button" onClick={() => setShowFallbackChoices((current) => !current)}>{showFallbackChoices ? '收起老师帮忙' : '需要老师帮忙？'}</button>}
        {nameStage === 'done' && showFallbackChoices && <div className="choice-grid child-fallback-grid">{currentQuestion.options.map((option) => <button className="choice-button" key={option} onClick={() => { setShowFallbackChoices(false); void answerAdaptiveTurn(option, 'choice') }}>{option}<ArrowRight size={15} /></button>)}</div>}
        <button className={`listen-orb child-listen-orb ${isListening ? 'listening' : ''}`} onClick={() => void startVoiceAnswer()} disabled={isTranscribing || conversationState === 'thinking' || conversationState === 'replying' || conversationState === 'generating' || conversationState === 'speaking'} aria-label={isTranscribing ? '正在识别' : isRecording ? '说完了' : isListening ? '停止聆听' : '开始说话'}><span className="orb-core"><Mic size={30} /></span><span className="orb-ring ring-one" /><span className="orb-ring ring-two" /></button>
        <div className="section-footer compact"><button className="text-button" onClick={goBack}><ArrowLeft size={16} />返回</button><button className="text-button" onClick={() => { setConversationState('paused'); stopVoice() }}>暂时休息</button></div>
      </section>}
      {view === 'analyzing' && <section className="content-section analysis-loading-section" aria-live="polite"><div className="analysis-loading-icon"><Sparkles size={28} /></div><div className="eyebrow"><span />正在整理</div><h2>把刚刚聊到的想法，<em>连起来看看。</em></h2><p>我会从几次回答里找线索，再给你几个可以自己挑选的想象方向。</p><small>{globalSettings.llmProvider !== 'template' ? '正在使用' + (globalSettings.llmProvider === 'siliconflow' ? '硅基流动' : '已配置的在线模型') + '；只处理文字回答。' : '正在使用内置模板整理想法。'}</small></section>}
      {view === 'dream-review' && dreamAnalysis && <section className="content-section narrow-section dream-review-section"><div className="section-heading"><div><div className="eyebrow"><span />一起确认</div><h2>我听到了这些想法</h2><p>下面只是几个想象方向，没有标准答案。你可以挑一个，也可以自己说。</p></div><div className="heading-icon mint"><Sparkles size={22} /></div></div><div className="dream-analysis-summary"><span>我从你的回答里听到</span><p>{dreamAnalysis.summary}</p><div className="dream-interest-list">{dreamAnalysis.interests.map((interest) => <span key={interest}>{interest}</span>)}</div></div><h3 className="dream-direction-heading">哪个方向最像你？</h3><div className="dream-direction-grid">{dreamAnalysis.possible_roles.map((option) => <button className={`dream-direction-card ${selectedDreamRole === option.label && !customDreamRole ? 'selected' : ''}`} key={option.label} aria-pressed={selectedDreamRole === option.label && !customDreamRole} onClick={() => { setSelectedDreamRole(option.label); setCustomDreamRole('') }}><strong>{option.label}</strong><span>{option.reason}</span></button>)}{!dreamAnalysis.possible_roles.some((option) => option.label === "梦想探索家") && <button className={`dream-direction-card ${selectedDreamRole === "梦想探索家" && !customDreamRole ? "selected" : ""}`} aria-pressed={selectedDreamRole === "梦想探索家" && !customDreamRole} onClick={() => { setSelectedDreamRole("梦想探索家"); setCustomDreamRole("") }}><strong>我还不知道</strong><span>可以先继续探索，不用现在决定长大后想做什么。</span></button>}</div><label className="field-label custom-dream-role">或者写下你自己的想法<input value={customDreamRole} onChange={(event) => setCustomDreamRole(event.target.value)} maxLength={80} placeholder="比如：我想照顾会发光的小兔子" /></label><p className="dream-review-note">如果这些方向都不太对，可以回去再聊一聊。想法会随着时间改变。</p><div className="analysis-source-note">{dreamAnalysis.source === 'siliconflow' ? '已由硅基流动整理文字回答' : dreamAnalysis.source === 'openai_compatible' ? '已由本次配置的在线模型整理文字回答' : dreamAnalysis.source === 'template_fallback' ? '在线模型暂时不可用，已用内置模板继续' : '由内置模板整理；文字回答没有发送到在线模型'}</div><div className="section-footer"><button className="text-button" onClick={() => setView('interview')}><ArrowLeft size={16} />再想一想</button><button className="primary-button" onClick={confirmDreamDirection}>就选这个方向 <ArrowRight size={17} /></button></div></section>}
      {view === "photo" && <section className="content-section photo-section">
        <div className="section-heading"><div><div className="eyebrow"><span />选择形象</div><h2>让未来职业形象里的主角像你</h2><p>{globalSettings.imageProvider === "siliconflow" ? "拍一张正脸照，AI 会生成你长大后从事这个职业的真实照片；也可以不上传照片，生成卡通职业形象。" : "当前使用 Mock 预览，不会实际生成职业形象。切换到硅基流动后，可授权把孩子的脸用于生成真实职业照片。"}</p></div><div className="heading-icon blue"><ImageIcon size={22} /></div></div>
        <div className="photo-options">
          <button className={"photo-option " + (photoMode === "photo" ? "selected" : "")} onClick={() => selectPhotoMode("photo")}><Camera size={23} /><strong>{globalSettings.imageProvider === "siliconflow" ? "用我的脸生成真实职业照" : "拍照预览"}</strong><span>{globalSettings.imageProvider === "siliconflow" ? "授权后，参考这张脸生成长大后的真实职业照片（非卡通）" : "照片只暂存在本机；Mock 不会用照片生成形象"}</span></button>
          <button className={"photo-option " + (photoMode === "cartoon" ? "selected" : "")} onClick={() => selectPhotoMode("cartoon")}><Sparkles size={23} /><strong>生成卡通职业主角</strong><span>不使用或上传真实照片，生成卡通形象</span></button>
          <button className={"photo-option " + (photoMode === "none" ? "selected" : "")} onClick={() => selectPhotoMode("none")}><CircleHelp size={23} /><strong>只画职业工作场景</strong><span>插画中不出现人物</span></button>
        </div>
        {photoMode === "photo" && <div className="camera-capture">
          <div className="camera-frame">{photoPreview ? <img src={photoPreview} alt="本次职业形象的脸部参考照片" /> : <video ref={videoRef} autoPlay muted playsInline />}</div>
          <div className="camera-actions">
            {photoPreview
              ? <button className="secondary-button" onClick={() => { setPhotoPreview(null); setOnlinePhotoConsent(false); setCameraError(''); void startCamera() }}><RefreshCw size={16} />重新拍摄</button>
              : <div className="camera-action-row">
                  <button className="primary-button" onClick={capturePhoto}><Camera size={17} />拍下这一刻</button>
                  <button className="secondary-button" onClick={() => photoInputRef.current?.click()}><Upload size={16} />上传照片</button>
                </div>}
            <input ref={photoInputRef} className="photo-file-input" type="file" accept="image/*" onChange={(event) => void handlePhotoFile(event)} />
            <p className="camera-help">{cameraError || '摄像头没有画面时，可以直接上传一张孩子的正脸照；照片只在本机暂存，勾选授权后才会发给图片模型。'}</p>
          </div>
        </div>}
        {globalSettings.imageProvider === "siliconflow" && photoMode === "photo" && <div className="render-mode-panel">
          <div className="render-mode-copy"><strong>照片里的样子</strong><span>长大版会先生成成年职业形象，再把孩子的五官融合进去；课堂时间紧可以选现在的样子。</span></div>
          <div className="render-mode-options">
            <button type="button" className={"render-mode-option " + (photoAgeMode === "grown" ? "selected" : "")} aria-pressed={photoAgeMode === "grown"} onClick={() => setPhotoAgeMode("grown")}><Sparkles size={17} /><strong>长大以后</strong><span>约 1 分钟 · 成年职业形象</span></button>
            <button type="button" className={"render-mode-option " + (photoAgeMode === "now" ? "selected" : "")} aria-pressed={photoAgeMode === "now"} onClick={() => setPhotoAgeMode("now")}><Zap size={17} /><strong>现在的样子</strong><span>约 20 秒 · 保留现在的脸</span></button>
          </div>
        </div>}
        {globalSettings.imageProvider === "siliconflow" && photoMode !== "photo" && <div className="render-mode-panel">
          <div className="render-mode-copy"><strong>出图速度</strong><span>按课堂时间选；选好后也能在梦想卡上重新生成。</span></div>
          <div className="render-mode-options">
            <button type="button" className={"render-mode-option " + (renderMode === "quality" ? "selected" : "")} aria-pressed={renderMode === "quality"} onClick={() => chooseRenderMode("quality")}><Sparkles size={17} /><strong>精细绘本</strong><span>约 15–20 秒 · 水彩绘本感</span></button>
            <button type="button" className={"render-mode-option " + (renderMode === "fast" ? "selected" : "")} aria-pressed={renderMode === "fast"} onClick={() => chooseRenderMode("fast")}><Zap size={17} /><strong>快速卡通</strong><span>约 5 秒 · 干净卡通</span></button>
          </div>
        </div>}
        {globalSettings.imageProvider === "siliconflow" && photoMode === "photo" && photoPreview && <div className="online-model-callout photo-consent-callout"><ImageIcon size={18} /><div><strong>{onlinePhotoConsent ? "已授权本次照片用于生成" : "照片上传需要单独确认"}</strong><p>勾选后，本张照片会作为参考图发送给硅基流动，用来生成孩子从事该职业的真实照片形象（按上面选择的年龄样式）。本项目后端不会保存原始照片；在线服务的数据处理和留存遵循服务商政策。</p><label className="online-model-consent"><input type="checkbox" checked={onlinePhotoConsent} onChange={(event) => setOnlinePhotoConsent(event.target.checked)} /><span>{mode === "classroom" ? "老师已确认家长或监护人同意发送本张照片" : "家长或监护人已同意发送本张照片"}</span></label></div></div>}
        {globalSettings.imageProvider === "mock" && photoMode === "photo" && photoPreview && <div className="warning-callout"><CircleHelp size={18} /><span>照片仍留在本机，但当前 Mock 预览不会用照片生成职业形象。请在全局设置启用硅基流动图片生成。</span></div>}
        <div className="section-footer"><button className="text-button" onClick={goBack}><ArrowLeft size={16} />返回梦想方向</button><button className="primary-button" onClick={continueFromPhoto} disabled={photoMode === "photo" && (!photoPreview || (globalSettings.imageProvider === "siliconflow" && !onlinePhotoConsent))}>开始生成 <WandSparkles size={17} /></button></div>
      </section>}
      {view === 'generating' && <section className="generation-layout"><div className="generation-visual"><div className="generation-sun" /><div className="generation-land" /><span className="generation-icon">{dream.roleIcon}</span><div className="generation-spark spark-a">✦</div><div className="generation-spark spark-b">✧</div></div><div className="generation-copy"><div className="eyebrow"><span />正在创作</div><h2>正在画出<br /><em>想象中的未来。</em></h2><p>我们正在准备「{dream.scene}」的梦想场景。</p><div className="loading-line"><span /></div><small>{globalSettings.imageProvider === 'siliconflow' ? (photoMode === 'photo' && onlinePhotoConsent ? (photoAgeMode === 'grown' ? '真人照片模式会先生成成年职业形象，再融合孩子的脸，通常约 1 分钟。' : '真人照片模式会保留孩子现在的脸，换上职业服装，通常约 20 秒。') : '正在用硅基流动创作形象，通常需要几十秒。') : '使用本地 Mock 预览。'}</small><button className="text-button" onClick={() => setView('card')}>先看看本地预览 <ArrowRight size={16} /></button></div></section>}
      {view === 'card' && <section className="card-layout"><div className={'dream-art ' + dream.accent + (generatedImageUrl ? ' has-generated-image' : '')}>{generatedImageUrl && <img className="dream-generated-image" src={generatedImageUrl} alt={dream.role + '在' + dream.scene + '中的职业形象'} />}<div className="dream-art-top"><span>未来梦想剧场</span><span>第 {sessionNumber} 位</span></div><div className="dream-art-scene"><div className="scene-moon" /><div className="scene-hill hill-back" /><div className="scene-hill hill-front" /><span className="dream-emoji">{dream.roleIcon}</span></div><div className="dream-art-footer"><span>{dream.scene}</span><strong>{dream.role}</strong></div>{photoPreview && <div className="dream-child-photo"><img src={photoPreview} alt="本机保留的脸部参考照片" /><span>{generatedImageUrl ? '本机参考照' : '梦想旅人'}</span></div>}</div><div className="card-copy"><div className="eyebrow"><span />你的梦想卡</div><h2>未来的我：<br /><em>{dream.role}</em></h2><blockquote>“{dream.quote}”</blockquote><p className="card-note"><Sparkles size={15} />{generatedImageUrl ? (photoMode === 'photo' && photoPreview && onlinePhotoConsent ? '已根据单独授权的脸部照片生成真实职业照片形象。' : photoMode === 'none' ? '已生成职业工作场景插画。' : '已生成卡通职业形象插画。') : generationError || '这是本地梦想卡预览。'}</p><div className="card-actions"><button className="primary-button" onClick={startFutureSelf}><Play size={17} />和未来的自己聊聊</button><button className="secondary-button" onClick={downloadCard}><Download size={17} />下载梦想卡</button><button className="text-button" onClick={regenerate}><RefreshCw size={16} />重新生成</button></div></div></section>}
      {view === 'future' && <section className="future-layout"><div className="future-card"><div className={`future-avatar ${dream.accent}`}><span>{dream.roleIcon}</span></div><div className="future-label"><span />想象中的未来自己</div><h2>你好，我是未来的{dream.role}。</h2><p className="future-invitation">你可以说说想法，也可以用键盘输入。没有正确答案。</p><div className="future-chat" aria-live="polite">{futureTurns.map((turn, index) => <div className={`future-message ${turn.role === 'user' ? 'child-message' : 'future-message-reply'}`} key={`${turn.role}-${index}`}><small>{turn.role === 'user' ? '你说' : '未来的自己'}</small><p>{turn.text}</p></div>)}{futurePending && <div className="future-thinking">未来的自己正在想一想…</div>}</div><label className="field-label future-input-label">告诉未来的自己<textarea className="future-message-input" value={futureInput} onChange={(event) => setFutureInput(event.target.value)} maxLength={300} placeholder="比如：你每天都会做些什么？" disabled={futurePending || isTranscribing} /></label><div className="future-message-actions"><button className={`primary-button combined-voice-button ${isListening ? 'active' : ''}`} onClick={() => { if (futureInput.trim() && !isListening && !isRecording && !isTranscribing) void answerFutureSelf(); else void startVoiceAnswer() }} disabled={futurePending}>{futurePending ? '未来的自己正在想一想…' : isTranscribing ? '正在识别…' : isRecording ? '我说完啦' : isListening ? '先停一下' : futureInput.trim() ? '发送给未来的自己' : '说一说'}</button></div>{voiceError && <div className="warning-callout voice-warning"><CircleHelp size={18} /><span>{voiceError}</span></div>}</div><div className="future-side"><div className="eyebrow"><span />想象中的对话</div><h2>把今天的想法，<br /><em>带到未来去。</em></h2><p>未来的自己不会预测答案，只会陪你继续想象。可以接着问，想法也可以随时改变。</p><div className="future-controls"><button className="secondary-button" onClick={() => speak(futureReply || `你好，我是想象中的未来的${dream.role}。你想聊些什么？`)}><Volume2 size={17} />重播语音</button><button className="text-button" onClick={finishSession}>结束体验 <ArrowRight size={16} /></button></div></div></section>}
      {view === 'complete' && <section className="complete-layout"><div className="complete-check"><Check size={30} /></div><div className="eyebrow"><span />体验完成</div><h2>这份梦想，<em>先收藏起来。</em></h2><p>你可以下载这张梦想卡，也可以把本次体验的临时数据全部删除。</p><div className="complete-preview"><div className={`mini-dream ${dream.accent}`}><span>{dream.roleIcon}</span></div><div><strong>未来的我：{dream.role}</strong><small>“{dream.quote}”</small></div></div><div className="complete-actions"><button className="primary-button" onClick={downloadCard}><Download size={17} />下载梦想卡</button>{mode === 'classroom' && classRoster.length > 0 && <button className="secondary-button" onClick={() => setView('poster')}><Sparkles size={17} />生成班级海报（{classRoster.length} 位）</button>}<button className="secondary-button" onClick={() => clearSession(true)}><ArrowRight size={17} />下一位小朋友</button><button className="danger-button" onClick={() => clearSession(false)}><Trash2 size={17} />删除当前数据</button></div><div className="privacy-footer"><ShieldCheck size={15} />{privacyMessage}</div></section>}
      {view === 'poster' && <section className="content-section poster-section">
        <div className="section-heading"><div><div className="eyebrow"><span />班级梦想海报</div><h2>我们的梦想</h2><p>全班 {classRoster.length} 位小朋友的梦想角色都在这里。可以下载 PNG 打印或分享。</p></div><div className="heading-icon mint"><Sparkles size={22} /></div></div>
        <div className="poster-grid" style={{ gridTemplateColumns: `repeat(${classRoster.length <= 1 ? 1 : classRoster.length <= 4 ? 2 : classRoster.length <= 9 ? 3 : 4}, 1fr)` }}>
          {classRoster.map((entry) => <div className="poster-cell" key={entry.id}>
            <div className={`poster-cell-art ${entry.accent}`}>
              {entry.imageUrl ? <img src={entry.imageUrl} alt={`${entry.name}的梦想形象`} /> : <span className="poster-cell-emoji">{entry.roleIcon}</span>}
            </div>
            <strong className="poster-cell-name">{entry.name}</strong>
            <span className="poster-cell-role">{entry.gender === 'boy' ? '小男孩 · ' : entry.gender === 'girl' ? '小女孩 · ' : ''}未来的{entry.role}</span>
          </div>)}
        </div>
        <div className="section-footer">
          <button className="text-button" onClick={goBack}><ArrowLeft size={16} />返回</button>
          <button className="primary-button" onClick={() => void downloadPoster()} disabled={!classRoster.length}><Download size={17} />下载海报 PNG</button>
        </div>
        <div className="privacy-footer"><ShieldCheck size={15} />班级名册只保存在本机内存中，删除数据或返回入口后会自动清空。</div>
      </section>}
    </main>
    <footer className="app-footer"><span><ShieldCheck size={14} />儿童友好 · 隐私默认保护</span><span>开源原型 · {globalSettings.imageProvider === 'siliconflow' ? '硅基流动图片服务' : 'Mock 图片预览'}</span></footer>
  </div>
}

export default App
