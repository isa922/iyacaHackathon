import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider, db } from './firebase'; // db'yi ekledik
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore'; // Veritabanı yazma fonksiyonları
import { Leaf, ArrowRight, Loader2, Mail, Lock, User, AtSign } from 'lucide-react'; // Yeni ikonlar eklendi

export default function Login() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  
  // State'ler
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(""); // Yeni
  const [username, setUsername] = useState(""); // Yeni
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Email/Şifre Giriş veya Kayıt
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isRegister) {
        // --- KAYIT İŞLEMİ ---
        
        // 1. Kullanıcıyı oluştur
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Auth profiline Ad Soyad ekle (Uygulamanın her yerinde user.displayName olarak görünür)
        await updateProfile(user, {
            displayName: fullName
        });

        // 3. Firestore veritabanına detayları kaydet
        // "users" koleksiyonunda user.uid kimliğiyle bir döküman oluşturuyoruz.
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            fullName: fullName,
            username: username, // Kullanıcı adını buraya saklıyoruz
            createdAt: new Date(),
            score: 0, // Hackathon için puan sistemi başlangıcı
            collected_count: 0,
            role: 'user'
        });

      } else {
        // --- GİRİŞ İŞLEMİ ---
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/'); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      
      {/* SOL TARA (Görsel ve Branding) - Değişmedi */}
      <div className="hidden lg:flex w-1/2 bg-emerald-600 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-teal-800 opacity-90 z-10"></div>
        <img 
            src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=2070&auto=format&fit=crop" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay"
            alt="Nature"
        />
        <div className="relative z-20 text-white p-12 max-w-xl">
            <div className="bg-white/20 backdrop-blur-md w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-xl border border-white/10">
                <Leaf size={32} className="text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-6 tracking-tight">Doğayı Keşfet,<br/>Temizle ve Koru.</h1>
            <p className="text-emerald-100 text-xl font-light leading-relaxed">
                trasHunter ile çevrendeki kirlilikleri bildir, temizlik hareketine katıl ve puanlar toplayarak liderlik tablosunda yüksel.
            </p>
        </div>
      </div>

      {/* SAĞ TARAF (Form) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
          
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                {isRegister ? "Aramıza Katıl" : "Tekrar Hoşgeldin"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
                {isRegister ? "Çevresel farkındalık hareketine katıl." : "Hesabına giriş yap ve göreve devam et."}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 animate-pulse">
                <span>⚠️</span> {error}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-400">veya e-posta ile</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleEmailAuth}>
            
            {/* Sadece Kayıt Olurken Gözükecek Alanlar */}
            {isRegister && (
                <>
                    <div className="relative animate-in slide-in-from-top-2 duration-300">
                        <User className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            required={isRegister} // Sadece kayıtken zorunlu
                            placeholder="Ad Soyad"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900"
                        />
                    </div>
                    <div className="relative animate-in slide-in-from-top-2 duration-300 delay-75">
                        <AtSign className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            required={isRegister}
                            placeholder="Kullanıcı Adı"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900"
                        />
                    </div>
                </>
            )}

            <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
                <input 
                    type="email" 
                    required 
                    placeholder="E-posta adresi"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900"
                />
            </div>
            <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                <input 
                    type="password" 
                    required 
                    placeholder="Şifre"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 mt-4"
            >
                {loading ? <Loader2 className="animate-spin" /> : (
                    <>
                        {isRegister ? "Kayıt Ol" : "Giriş Yap"}
                        <ArrowRight size={20} />
                    </>
                )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600">
            {isRegister ? "Zaten hesabın var mı? " : "Hesabın yok mu? "}
            <button 
                onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null); // Mod değiştirince hatayı temizle
                }} 
                className="font-bold text-emerald-600 hover:text-emerald-500 hover:underline"
            >
                {isRegister ? "Giriş Yap" : "Kayıt Ol"}
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}