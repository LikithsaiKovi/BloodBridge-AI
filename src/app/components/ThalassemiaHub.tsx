import { useState, useEffect, useRef } from 'react';
import { Heart, BookOpen, Users, MessageCircle, Droplet, CheckCircle, AlertCircle, Info, Sparkles, Activity, Brain, Send, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Progress } from './ui/progress';
import { awarenessApi, analyticsApi } from '../../lib/api';

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

const patientStories = [
  { name: "Priya Sharma", age: 24, location: "Mumbai", story: "Thanks to regular blood transfusions, I completed my engineering degree and now work at a tech company.", transfusions: 156, years: 12 },
  { name: "Arjun Patel", age: 19, location: "Ahmedabad", story: "The AI donor matching system helped me find compatible donors quickly during critical times.", transfusions: 89, years: 8 },
  { name: "Meera Reddy", age: 31, location: "Hyderabad", story: "Living with thalassemia major taught me resilience. With proper care, I'm now a successful artist.", transfusions: 234, years: 18 }
];

const educationTopics = [
  { id: 'overview', title: 'What is Thalassemia?', icon: Heart, gradient: 'from-red-500 to-pink-500', content: { description: 'Thalassemia is an inherited blood disorder that causes the body to produce less hemoglobin than normal.', keyPoints: ['Affects oxygen-carrying capacity of blood', 'Requires regular blood transfusions', 'Most common in Mediterranean, Middle Eastern, and Asian populations', 'Over 100,000 children born with severe thalassemia annually'] } },
  { id: 'types', title: 'Types & Severity', icon: Activity, gradient: 'from-blue-500 to-cyan-500', content: { description: 'Thalassemia has different types based on which part of hemoglobin is affected.', keyPoints: ['Alpha Thalassemia: Affects alpha globin chain production', 'Beta Thalassemia: Affects beta globin chain production', 'Thalassemia Minor: Mild anemia, minimal symptoms', 'Thalassemia Major: Severe anemia, requires lifelong transfusions'] } },
  { id: 'symptoms', title: 'Signs & Symptoms', icon: AlertCircle, gradient: 'from-orange-500 to-red-500', content: { description: 'Symptoms vary based on severity but typically include signs of anemia.', keyPoints: ['Fatigue and weakness', 'Pale or yellowish skin', 'Facial bone deformities', 'Slow growth and delayed puberty in children', 'Abdominal swelling (enlarged spleen/liver)'] } },
  { id: 'treatment', title: 'Treatment Options', icon: Sparkles, gradient: 'from-purple-500 to-pink-500', content: { description: 'Modern treatment has significantly improved quality of life for thalassemia patients.', keyPoints: ['Regular blood transfusions every 2-4 weeks', 'Iron chelation therapy to remove excess iron', 'Folic acid supplementation', 'Bone marrow or stem cell transplant (curative)', 'Gene therapy (emerging treatment)'] } }
];

const eligibilityQuestions = [
  { id: 'age', question: 'Are you between 18-65 years old?', key: 'ageOk' },
  { id: 'weight', question: 'Do you weigh at least 45 kg?', key: 'weightOk' },
  { id: 'hb', question: 'Is your hemoglobin normal (no severe anemia)?', key: 'hbOk' },
  { id: 'recent', question: 'Have you NOT donated in the last 90 days?', key: 'recentOk' },
  { id: 'healthy', question: 'Are you free from fever/illness in last 2 weeks?', key: 'healthyOk' },
];

export default function ThalassemiaHub() {
  const [selectedTopic, setSelectedTopic] = useState('overview');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: 'ai', text: "Hello! I'm your AI Thalassemia educator. Ask me anything about Thalassemia, blood donation eligibility, or treatment options!", timestamp: new Date().toISOString() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [stats, setStats] = useState({ active_patients: 2847, active_donors: 8234, education_resources: 127, support_messages: 5621 });
  const [eligibilityAnswers, setEligibilityAnswers] = useState<Record<string, boolean | null>>({});
  const [eligibilityResult, setEligibilityResult] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    awarenessApi.stats().then(s => setStats(s)).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: new Date().toISOString() }]);
    setChatLoading(true);
    try {
      const resp = await awarenessApi.chat({ message: userMsg, session_id: sessionId });
      setSessionId(resp.session_id);
      setChatMessages(prev => [...prev, { role: 'ai', text: resp.response, timestamp: resp.timestamp }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: "I'm having trouble connecting. Please ensure the backend is running at localhost:8000.", timestamp: new Date().toISOString() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const checkEligibility = () => {
    const answers = Object.values(eligibilityAnswers);
    const answered = answers.filter(a => a !== null && a !== undefined);
    if (answered.length < eligibilityQuestions.length) {
      setEligibilityResult('Please answer all questions first.');
      return;
    }
    const allYes = answers.every(a => a === true);
    if (allYes) {
      setEligibilityResult('✅ You appear eligible to donate blood! Please visit your nearest blood bank for a final health check.');
    } else {
      setEligibilityResult('❌ Based on your answers, you may not be eligible right now. Consult your doctor for guidance.');
    }
  };

  const currentTopic = educationTopics.find(t => t.id === selectedTopic);
  const Icon = currentTopic?.icon || Heart;

  const statItems = [
    { label: 'Active Patients', value: stats.active_patients?.toLocaleString() || '2,847', icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'Active Donors', value: stats.active_donors?.toLocaleString() || '8,234', icon: Droplet, color: 'from-red-500 to-pink-500' },
    { label: 'Education Resources', value: stats.education_resources?.toString() || '127', icon: BookOpen, color: 'from-purple-500 to-pink-500' },
    { label: 'Support Messages', value: stats.support_messages?.toLocaleString() || '5,621', icon: MessageCircle, color: 'from-orange-500 to-red-500' },
  ];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#D90429] to-[#EF233C] p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                <Heart className="w-7 h-7" />
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-xl">Premium Education</Badge>
            </div>
            <h1 className="text-4xl font-semibold mb-3">Thalassemia Awareness Hub</h1>
            <p className="text-white/90 text-lg max-w-2xl">Comprehensive education portal for patients, families, and healthcare providers</p>
          </div>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-4 gap-6">
          {statItems.map((stat, i) => (
            <Card key={i} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Interactive Education Portal */}
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            {educationTopics.map((topic) => {
              const TopicIcon = topic.icon;
              const isActive = selectedTopic === topic.id;
              return (
                <button key={topic.id} onClick={() => setSelectedTopic(topic.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-300 group relative overflow-hidden ${isActive ? 'bg-white border-gray-200 shadow-xl shadow-gray-200/50' : 'bg-white/50 border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-lg'}`}>
                  {isActive && <div className={`absolute inset-0 bg-gradient-to-r ${topic.gradient} opacity-5`} />}
                  <div className="relative z-10 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isActive ? `bg-gradient-to-br ${topic.gradient} shadow-lg` : 'bg-gray-100 group-hover:bg-gray-200'}`}>
                      <TopicIcon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className={`font-medium text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{topic.title}</div>
                  </div>
                </button>
              );
            })}

            {/* AI Assistant Card */}
            <Card className="border-2 border-dashed border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-gray-900 mb-1">AI Education Assistant</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">Ask any question about thalassemia</p>
                  </div>
                </div>
                <Button onClick={() => setChatOpen(!chatOpen)} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  {chatOpen ? 'Hide Chat' : 'Ask AI'}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-2 space-y-6">
            {/* AI Chat */}
            {chatOpen && (
              <Card className="border-0 shadow-xl shadow-purple-200/50 border border-purple-100">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="w-5 h-5 text-purple-600" />
                    AI Thalassemia Educator
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-0 text-xs ml-auto">Powered by BloodBridge AI</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-56 overflow-y-auto space-y-3 mb-4 pr-2">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                          {msg.role === 'ai' && msg.text.includes('**') ? (
                            <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                          ) : msg.text}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 p-3 rounded-2xl rounded-bl-sm">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder='Ask: "What is Thalassemia?" or "Can I donate?"'
                      className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                    <Button onClick={sendMessage} disabled={chatLoading} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 rounded-xl px-4">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-xl shadow-gray-200/50">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${currentTopic?.gradient} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-2">{currentTopic?.title}</CardTitle>
                    <CardDescription className="text-base">{currentTopic?.content.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentTopic?.content.keyPoints.map((point, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{point}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-xl shadow-gray-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-[#D90429]" />
                  Transfusion Requirements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[{ label: 'Thalassemia Major', freq: 'Every 2-3 weeks', val: 95 }, { label: 'Thalassemia Intermedia', freq: 'Every 4-6 weeks', val: 60 }, { label: 'Thalassemia Minor', freq: 'Rarely needed', val: 15 }].map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{item.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{item.freq}</span>
                      </div>
                      <Progress value={item.val} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Patient Stories */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Patient Success Stories</h2>
              <p className="text-gray-600">Real experiences from our thalassemia community</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {patientStories.map((story, i) => (
              <Card key={i} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="w-14 h-14">
                      <AvatarFallback className="bg-gradient-to-br from-[#D90429] to-[#EF233C] text-white font-semibold text-lg">
                        {story.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{story.name}</h3>
                      <p className="text-sm text-gray-600">{story.age} years • {story.location}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4 italic">"{story.story}"</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-red-50 to-pink-50">
                      <div className="text-2xl font-semibold text-gray-900 mb-1">{story.transfusions}</div>
                      <div className="text-xs text-gray-600">Transfusions</div>
                    </div>
                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50">
                      <div className="text-2xl font-semibold text-gray-900 mb-1">{story.years}</div>
                      <div className="text-xs text-gray-600">Years of Care</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Eligibility Checker */}
        <Card className="border-0 shadow-xl shadow-gray-200/50 bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>Interactive Eligibility Checker</CardTitle>
                <CardDescription>Check if you can donate blood today</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 mb-4">
              {eligibilityQuestions.map((q) => (
                <div key={q.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-200">
                  <span className="text-sm font-medium text-gray-700">{q.question}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setEligibilityAnswers(p => ({ ...p, [q.key]: true }))}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${eligibilityAnswers[q.key] === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100'}`}>Yes</button>
                    <button onClick={() => setEligibilityAnswers(p => ({ ...p, [q.key]: false }))}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${eligibilityAnswers[q.key] === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-100'}`}>No</button>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={checkEligibility} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-lg mb-3">
              Check My Eligibility
            </Button>
            {eligibilityResult && (
              <div className={`p-4 rounded-xl text-sm font-medium ${eligibilityResult.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-200' : eligibilityResult.startsWith('❌') ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}`}>
                {eligibilityResult}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
