import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Calendar, Sparkles, Volume2 } from 'lucide-react'
import { cx } from '../lib/util'
import { Badge, Card } from './ui'

type LangKey = 'en' | 'ta' | 'ms'
type PeriodMode = 'daily' | 'weekly'

interface LangEntry {
  word: string
  partOfSpeech: string
  phonetic: string
  meaning: string
  example: string
  translation?: string
}

interface VocabSet {
  id: string
  theme: string
  en: LangEntry
  ta: LangEntry
  ms: LangEntry
}

const VOCABULARY_WORDS: VocabSet[] = [
  {
    id: 'resilience',
    theme: 'Mindset',
    en: {
      word: 'Resilience',
      partOfSpeech: 'Noun',
      phonetic: '/rɪˈzɪl.i.əns/',
      meaning: 'The strength to recover quickly from challenges and keep speaking without fear of mistakes.',
      example: 'Every small conversation builds the resilience you need to thrive in a new language.',
    },
    ta: {
      word: 'துணிவு',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'thu-ni-vu',
      meaning: 'தயக்கமின்றித் தவறுகளிலிருந்து கற்று மீண்டும் நம்பிக்கையோடு பேசும் மன உறுதி.',
      example: 'தொடர்ந்து பேசும் துணிவு இருந்தால் எந்த மொழியையும் எளிதில் கற்கலாம்.',
      translation: 'With the resilience to keep speaking, any language can be learned with ease.',
    },
    ms: {
      word: 'Ketabahan',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-ta-ba-han',
      meaning: 'Kekuatan hati untuk terus berusaha dan belajar walaupun berdepan kesukaran.',
      example: 'Ketabahan berlatih setiap hari membantu pelajar bercakap dengan lebih lancar.',
      translation: 'Perseverance in practising every day helps learners speak more fluently.',
    },
  },
  {
    id: 'fluency',
    theme: 'Communication',
    en: {
      word: 'Fluency',
      partOfSpeech: 'Noun',
      phonetic: '/ˈfluː.ən.si/',
      meaning: 'The ability to express thoughts smoothly, naturally, and comfortably in conversation.',
      example: 'Fluency grows faster when you speak in friendly real-life scenarios rather than memorising rules.',
    },
    ta: {
      word: 'சரளத்தன்மை',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'sa-ra-la-than-mai',
      meaning: 'தடையின்றி இயல்பாகவும் தெளிவாகவும் ஒரு மொழியில் பேசும் திறன்.',
      example: 'நண்பர்களுடன் தினமும் உரையாடுவது உங்கள் பேச்சில் சரளத்தன்மையை வளர்க்கும்.',
      translation: 'Chatting daily with friends grows natural fluency in your speech.',
    },
    ms: {
      word: 'Kefasihan',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-fa-si-han',
      meaning: 'Keupayaan bertutur atau menulis dengan lancar, jelas, dan semula jadi.',
      example: 'Kefasihan berbahasa membuka lebih banyak peluang kerjaya di tempat kerja.',
      translation: 'Language fluency opens more career opportunities at the workplace.',
    },
  },
  {
    id: 'confidence',
    theme: 'Speaking',
    en: {
      word: 'Confidence',
      partOfSpeech: 'Noun',
      phonetic: '/ˈkɒn.fɪ.dəns/',
      meaning: 'Trusting your voice enough to share ideas openly, even while still learning.',
      example: 'Her confidence grew noticeably once she joined our small evening speaking circle.',
    },
    ta: {
      word: 'தன்னம்பிக்கை',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'than-nam-bik-kai',
      meaning: 'நம்மால் நன்றாகப் பேச முடியும் என்ற உள்ளார்ந்த நம்பிக்கை.',
      example: 'சிறிய குழுக்களில் பேசுவது மாணவர்களுக்குப் புதிய தன்னம்பிக்கையைத் தருகிறது.',
      translation: 'Speaking in small groups gives learners fresh self-confidence.',
    },
    ms: {
      word: 'Keyakinan',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-ya-ki-nan',
      meaning: 'Rasa percaya pada kebolehan diri sendiri untuk menyuarakan pendapat.',
      example: 'Keyakinan diri meningkat apabila kita belajar dalam suasana yang menyokong.',
      translation: 'Self-confidence rises when we learn in a supportive environment.',
    },
  },
  {
    id: 'curiosity',
    theme: 'Learning Habit',
    en: {
      word: 'Curiosity',
      partOfSpeech: 'Noun',
      phonetic: '/ˌkjʊə.riˈɒs.ə.ti/',
      meaning: 'An eager desire to ask questions, explore phrases, and understand another culture.',
      example: 'Curiosity turns every coffee-shop menu or street sign into a mini language lesson.',
    },
    ta: {
      word: 'ஆர்வம்',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'aar-vam',
      meaning: 'புதிய சொற்களையும் கருத்துகளையும் தெரிந்து கொள்ளும் உற்சாகம்.',
      example: 'கேள்விகள் கேட்கும் ஆர்வம் உங்கள் சொற்களஞ்சியத்தை விரிவாக்கும்.',
      translation: 'Curiosity to ask questions expands your vocabulary.',
    },
    ms: {
      word: 'Sifat Ingin Tahu',
      partOfSpeech: 'Frasa Nama · Noun',
      phonetic: 'si-fat in-gin ta-hu',
      meaning: 'Keinginan mendalam untuk meneroka ilmu, ungkapan, dan budaya baharu.',
      example: 'Sifat ingin tahu mendorong pelajar mencuba ayat baharu di dalam kelas.',
      translation: 'Curiosity encourages students to try new sentences in class.',
    },
  },
  {
    id: 'articulate',
    theme: 'Expression',
    en: {
      word: 'Articulate',
      partOfSpeech: 'Adjective / Verb',
      phonetic: '/ɑːˈtɪk.jə.lət/',
      meaning: 'Able to express thoughts clearly and concisely so listeners immediately understand.',
      example: 'Practising 60-second stories helps learners become articulate in team meetings.',
    },
    ta: {
      word: 'தெளிவாகப் பேசும்',
      partOfSpeech: 'பெயரடை · Adjective',
      phonetic: 'the-li-vaa-ga pe-sum',
      meaning: 'கருத்துகளைச் சுருக்கமாகவும் புரியும்படியும் வெளிப்படுத்தும் திறன் கொண்ட.',
      example: 'அவர் தனது எண்ணங்களை மிகத் தெளிவாகப் பேசும் ஆற்றல் பெற்றவர்.',
      translation: 'She has the ability to articulate her thoughts with great clarity.',
    },
    ms: {
      word: 'Petah Berbicara',
      partOfSpeech: 'Frasa Adjektif · Adjective',
      phonetic: 'pe-tah ber-bi-ca-ra',
      meaning: 'Pandai menyusun kata dengan teratur, kemas, dan mudah difahami orang ramai.',
      example: 'Peserta muda itu sangat petah berbicara di pentas akhir.',
      translation: 'The young participant was remarkably articulate on the finale stage.',
    },
  },
  {
    id: 'empathy',
    theme: 'Connection',
    en: {
      word: 'Empathy',
      partOfSpeech: 'Noun',
      phonetic: '/ˈem.pə.θi/',
      meaning: 'Understanding another person’s feelings and listening patiently across language barriers.',
      example: 'Teaching with empathy makes our classroom a safe place for adult beginners.',
    },
    ta: {
      word: 'பரிவு',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'pa-ri-vu',
      meaning: 'பிறருடைய உணர்வுகளையும் தயக்கங்களையும் புரிந்து கொண்டு ஆதரிக்கும் குணம்.',
      example: 'பரிவுடன் கேட்கும் ஆசிரியர் மாணவர்களின் பயத்தை நீக்குகிறார்.',
      translation: 'A teacher who listens with empathy removes a learner’s fear.',
    },
    ms: {
      word: 'Empati',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'em-pa-ti',
      meaning: 'Kebolehan memahami perasaan dan pengalaman orang lain dengan penuh keprihatinan.',
      example: 'Nilai empati menjadikan komunikasi di tempat kerja lebih harmoni.',
      translation: 'Empathy makes workplace communication more harmonious.',
    },
  },
  {
    id: 'perseverance',
    theme: 'Growth',
    en: {
      word: 'Perseverance',
      partOfSpeech: 'Noun',
      phonetic: '/ˌpɜː.sɪˈvɪə.rəns/',
      meaning: 'Steady effort over weeks and months even when progress feels gradual.',
      example: 'Ten minutes of reading aloud each evening rewards perseverance with clear speech.',
    },
    ta: {
      word: 'விடாமுயற்சி',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'vi-daa-mu-yar-chi',
      meaning: 'தொடர்ந்து முயற்சி செய்து கொண்டே இருக்கும் தளராத உழைப்பு.',
      example: 'விடாமுயற்சி இருந்தால் சரளமாகப் பேசும் இலக்கை நிச்சயம் அடையலாம்.',
      translation: 'With perseverance, you will surely reach your goal of fluent speaking.',
    },
    ms: {
      word: 'Ketekunan',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-te-ku-nan',
      meaning: 'Usaha yang berterusan tanpa berputus asa sehingga mencapai matlamat.',
      example: 'Ketekunan menghadiri kelas malam membuahkan hasil yang membanggakan.',
      translation: 'Perseverance in attending evening classes brings proud results.',
    },
  },
  {
    id: 'dialogue',
    theme: 'Practice',
    en: {
      word: 'Dialogue',
      partOfSpeech: 'Noun',
      phonetic: '/ˈdaɪ.ə.lɒɡ/',
      meaning: 'A meaningful two-way conversation where both speakers listen and respond thoughtfully.',
      example: 'Every lesson ends with a lively partner dialogue on real everyday topics.',
    },
    ta: {
      word: 'உரையாடல்',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'u-rai-yaa-dal',
      meaning: 'இருவர் அல்லது பலர் கருத்துகளைப் பகிர்ந்து கொள்ளும் இயல்பான பேச்சு.',
      example: 'அன்றாட உரையாடல் பயிற்சி புதிய சொற்களை நினைவில் நிறுத்தும்.',
      translation: 'Everyday dialogue practice helps new words stick in memory.',
    },
    ms: {
      word: 'Dialog',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'di-a-log',
      meaning: 'Perbualan dua hala atau perbincangan terbuka antara dua pihak atau lebih.',
      example: 'Latihan dialog pendek sangat berkesan untuk membina keyakinan murid.',
      translation: 'Short dialogue exercises are very effective for building student confidence.',
    },
  },
  {
    id: 'perspective',
    theme: 'Thinking',
    en: {
      word: 'Perspective',
      partOfSpeech: 'Noun',
      phonetic: '/pəˈspek.tɪv/',
      meaning: 'A way of viewing a situation or idea, enriched when you learn multiple languages.',
      example: 'Learning Bahasa Melayu, Tamil, and English gives Malaysians a richer perspective.',
    },
    ta: {
      word: 'கண்ணோட்டம்',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'kan-not-tam',
      meaning: 'ஒரு விஷயத்தை அல்லது கருத்தை நாம் பார்க்கும் கோணம்.',
      example: 'பல மொழிகள் கற்பது வாழ்க்கையைப் பற்றிய நமது கண்ணோட்டத்தை விரிவாக்கும்.',
      translation: 'Learning multiple languages broadens our perspective on life.',
    },
    ms: {
      word: 'Perspektif',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'per-spek-tif',
      meaning: 'Sudut pandangan atau cara memahami sesuatu isu secara menyeluruh.',
      example: 'Menguasai lebih daripada satu bahasa memberi kita perspektif yang lebih luas.',
      translation: 'Mastering more than one language gives us a wider perspective.',
    },
  },
  {
    id: 'milestone',
    theme: 'Progress',
    en: {
      word: 'Milestone',
      partOfSpeech: 'Noun',
      phonetic: '/ˈmaɪl.stəʊn/',
      meaning: 'An important achievement that marks real progress on your learning journey.',
      example: 'Delivering your first two-minute presentation without notes is a proud milestone.',
    },
    ta: {
      word: 'மைல்கல்',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'mail-kal',
      meaning: 'நம் கற்றல் பயணத்தில் எட்டும் முக்கியமான வெற்றிப் படி.',
      example: 'மேடையில் தயக்கமின்றிப் பேசியது அவளுடைய கற்றலில் ஒரு பெரிய மைல்கல்.',
      translation: 'Speaking on stage without hesitation was a major milestone in her learning.',
    },
    ms: {
      word: 'Pencapaian Penting',
      partOfSpeech: 'Frasa Nama · Noun',
      phonetic: 'pen-ca-pai-an pen-ting',
      meaning: 'Tahap kejayaan bermakna yang menandakan kemajuan besar dalam sesuatu usaha.',
      example: 'Menamatkan tahap asas ialah pencapaian penting bagi setiap pelajar dewasa.',
      translation: 'Completing the foundation level is a meaningful milestone for every adult learner.',
    },
  },
  {
    id: 'courage',
    theme: 'Mindset',
    en: {
      word: 'Courage',
      partOfSpeech: 'Noun',
      phonetic: '/ˈkʌr.ɪdʒ/',
      meaning: 'Willingness to raise your hand and try speaking aloud even when unsure of grammar.',
      example: 'Speaking courage matters far more than perfection on your first day in class.',
    },
    ta: {
      word: 'தைரியம்',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'thai-ri-yam',
      meaning: 'தயக்கத்தைத் தாண்டி முன்னேறிப் பேசும் மனத் தைரியம்.',
      example: 'பிழைகளைப் பற்றி கவலைப்படாமல் பேசும் தைரியமே வெற்றியின் முதல் படி.',
      translation: 'The courage to speak without worrying about mistakes is the first step to success.',
    },
    ms: {
      word: 'Keberanian',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-be-ra-ni-an',
      meaning: 'Sikap berani mencuba sesuatu yang baharu tanpa takut akan kesilapan.',
      example: 'Keberanian bertanya soalan dalam kelas mempercepatkan penguasaan bahasa.',
      translation: 'The courage to ask questions in class speeds up language mastery.',
    },
  },
  {
    id: 'clarity',
    theme: 'Speaking',
    en: {
      word: 'Clarity',
      partOfSpeech: 'Noun',
      phonetic: '/ˈklær.ə.ti/',
      meaning: 'Crisp pronunciation and simple word choice that make your message easy to follow.',
      example: 'Slowing down slightly gives your sentences greater warmth and clarity.',
    },
    ta: {
      word: 'தெளிவு',
      partOfSpeech: 'பெயர்ச்சொல் · Noun',
      phonetic: 'the-li-vu',
      meaning: 'குழப்பமில்லாமல் சுத்தமாகவும் புரியும்படியும் பேசும் பாங்கு.',
      example: 'நிதானமாகப் பேசும் போது உங்கள் உச்சரிப்பில் தெளிவு கூடும்.',
      translation: 'When you speak at a calm pace, clarity improves in your pronunciation.',
    },
    ms: {
      word: 'Kejelasan',
      partOfSpeech: 'Kata Nama · Noun',
      phonetic: 'ke-je-la-san',
      meaning: 'Sifat terang dan mudah difahami dalam penyampaian idea serta sebutan.',
      example: 'Kejelasan sebutan membantu rakan sekerja memahami pembentangan anda.',
      translation: 'Clarity of pronunciation helps colleagues understand your presentation.',
    },
  },
]

const LANG_TABS: { key: LangKey; label: string; bcp47: string }[] = [
  { key: 'en', label: 'English', bcp47: 'en-MY' },
  { key: 'ta', label: 'Tamil (தமிழ்)', bcp47: 'ta-IN' },
  { key: 'ms', label: 'Bahasa Melayu', bcp47: 'ms-MY' },
]

function getPeriodIndex(mode: PeriodMode): number {
  const now = new Date()
  if (mode === 'daily') {
    const startOfYear = new Date(now.getFullYear(), 0, 0)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
    return dayOfYear % VOCABULARY_WORDS.length
  }
  const weekOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 86400000))
  return weekOfYear % VOCABULARY_WORDS.length
}

export default function VocabularyWidget({ variant = 'public' }: { variant?: 'public' | 'portal' }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily')
  const [lang, setLang] = useState<LangKey>('en')
  const [idx, setIdx] = useState<number>(() => getPeriodIndex('daily'))
  const [speaking, setSpeaking] = useState(false)
  const [speechNotice, setSpeechNotice] = useState('')

  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel()
      } catch {
        // Ignore cleanup errors.
      }
    }
  }, [])

  const setPeriod = (nextMode: PeriodMode) => {
    setPeriodMode(nextMode)
    setIdx(getPeriodIndex(nextMode))
    setSpeechNotice('')
  }

  const nextWord = () => {
    setIdx((prev) => (prev + 1) % VOCABULARY_WORDS.length)
    setSpeechNotice('')
  }

  const current = VOCABULARY_WORDS[idx]
  const active = current[lang]
  const tabMeta = LANG_TABS.find((t) => t.key === lang)!

  const speakWord = () => {
    setSpeechNotice('')
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechNotice('Audio pronunciation is not supported in this browser.')
      return
    }
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(active.word)
      utter.lang = tabMeta.bcp47
      utter.rate = 0.9
      const voices = window.speechSynthesis.getVoices?.() ?? []
      const langPrefix = tabMeta.bcp47.slice(0, 2)
      const matched = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix))
      if (matched) utter.voice = matched
      utter.onstart = () => setSpeaking(true)
      utter.onend = () => setSpeaking(false)
      utter.onerror = () => {
        setSpeaking(false)
        setSpeechNotice(`Pronounce: ${active.word} (${active.phonetic})`)
      }
      setSpeaking(true)
      window.speechSynthesis.speak(utter)
      // Fallback reset if browser speech synthesis silently skips firing onend
      setTimeout(() => setSpeaking(false), 2500)
    } catch {
      setSpeaking(false)
      setSpeechNotice(`Pronounce: ${active.word} (${active.phonetic})`)
    }
  }

  const isPortal = variant === 'portal'

  return (
    <Card
      className={cx(
        'overflow-hidden border border-brand-cream-dark !p-0 shadow-sm',
        isPortal ? 'bg-gradient-to-br from-white via-brand-cream/30 to-white' : 'bg-white shadow-md',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-cream-dark/70 bg-brand-navy px-5 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-pink text-white shadow-sm">
            <BookOpen size={16} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight sm:text-base">
                {periodMode === 'daily' ? 'Word of the Day' : 'Word of the Week'}
              </h2>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-cream">
                {idx + 1} / {VOCABULARY_WORDS.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">Multilingual booster · English, Tamil &amp; Bahasa Melayu</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-black/25 p-1 text-xs">
            <button
              type="button"
              onClick={() => setPeriod('daily')}
              className={cx(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition',
                periodMode === 'daily' ? 'bg-brand-pink text-white' : 'text-slate-300 hover:text-white',
              )}
            >
              <Sparkles size={12} />Daily
            </button>
            <button
              type="button"
              onClick={() => setPeriod('weekly')}
              className={cx(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition',
                periodMode === 'weekly' ? 'bg-brand-pink text-white' : 'text-slate-300 hover:text-white',
              )}
            >
              <Calendar size={12} />Weekly
            </button>
          </div>
          <button
            type="button"
            onClick={nextWord}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-pink"
          >
            Next Word <ArrowRight size={13} />
          </button>
        </div>
      </div>

      <div className={cx('p-5', isPortal ? 'sm:p-5' : 'sm:p-6')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-brand-cream/70 p-1" role="tablist" aria-label="Vocabulary language">
            {LANG_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={lang === t.key}
                onClick={() => {
                  setLang(t.key)
                  setSpeechNotice('')
                }}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  lang === t.key
                    ? 'bg-brand-navy text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-brand-navy',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Badge tone="pink" text={current.theme} />
        </div>

        <div className="grid gap-4 md:grid-cols-12 md:items-center">
          <div className="md:col-span-5">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-2xl font-extrabold tracking-tight text-brand-navy sm:text-3xl">{active.word}</span>
              <Badge tone="navy" text={active.partOfSpeech} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg bg-brand-cream px-2.5 py-1 font-mono text-xs text-brand-navy">
                /{active.phonetic.replace(/^\/|\/$/g, '')}/
              </span>
              <button
                type="button"
                onClick={speakWord}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                  speaking
                    ? 'bg-brand-pink text-white shadow-sm'
                    : 'bg-brand-pink/15 text-brand-pink hover:bg-brand-pink hover:text-white',
                )}
                aria-label={`Listen to ${active.word}`}
              >
                <Volume2 size={14} />
                {speaking ? 'Speaking...' : 'Listen'}
              </button>
            </div>
            {speechNotice && <p className="mt-1.5 text-xs text-slate-500">{speechNotice}</p>}

            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">EN: <b>{current.en.word}</b></span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">தமிழ்: <b>{current.ta.word}</b></span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">BM: <b>{current.ms.word}</b></span>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl bg-brand-cream/50 p-4 md:col-span-7">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand-pink">Meaning</div>
              <p className="mt-0.5 text-sm leading-relaxed text-brand-navy">{active.meaning}</p>
            </div>
            <div className="border-t border-brand-cream-dark/60 pt-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Example in context</div>
              <p className="mt-0.5 text-sm italic leading-relaxed text-slate-700">“{active.example}”</p>
              {active.translation && (
                <p className="mt-1 text-xs text-slate-500">English: {active.translation}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
