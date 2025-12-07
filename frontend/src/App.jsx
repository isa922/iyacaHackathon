import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Camera, CheckCircle2, Trophy, Navigation, Loader2, X, Crosshair, AlertTriangle, Medal, User, LogOut, Trash2, Flame } from 'lucide-react';
import { auth, db } from './firebase';
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';

// --- AYARLAR ---
const API_URL = "http://127.0.0.1:8000";
const DISTANCE = 275

// Leaflet CSS
const leafletStyle = document.createElement("link");
leafletStyle.rel = "stylesheet";
leafletStyle.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
document.head.appendChild(leafletStyle);

const leafletScript = document.createElement("script");
leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
document.head.appendChild(leafletScript);

const leafletHeatScript = document.createElement("script");
leafletHeatScript.src = "https://unpkg.com/leaflet.heat/dist/leaflet-heat.js";
document.head.appendChild(leafletHeatScript);

// Mesafe Hesaplama
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Resim URL'sini düzelten yardımcı fonksiyon
const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_URL}/${path}`;
};

export default function App() {
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false); // Yükleniyor durumu ekleyelim
  const [mapInitialized, setMapInitialized] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false); // Heatmap modu kapalı başlar
  const [currentUser, setCurrentUser] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [userStats, setUserStats] = useState({
    score: 0,
    collected_count: 0,
    rank_title: 'Çevre Gönüllüsü'
  });

  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const fileInputRef = useRef(null);
  const heatmapLayerRef = useRef(null);

  const locationRef = useRef(userLocation);

  useEffect(() => {
    locationRef.current = userLocation;
  }, [userLocation]);

  const [activeModal, setActiveModal] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [permissionStatus, setPermissionStatus] = useState("prompt");
  const [distanceAlert, setDistanceAlert] = useState(null);

  // --- API FONKSİYONLARI ---

  // Markerları Getir
  const fetchMarkers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/markers`);
      if (response.ok) {
        const data = await response.json();
        setMarkers(data);
      }
    } catch (error) {
      console.error("API Hatası:", error);
    }
  };

  useEffect(() => {
    if (activeModal === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeModal]);

  // Marker ve Heatmap Çizimi
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;

    if (markersLayerRef.current) markersLayerRef.current.clearLayers();

    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.remove();
      heatmapLayerRef.current = null;
    }


    if (showHeatmap) {
      if (window.L.heatLayer) {
        const heatData = markers
          .filter(m => m.lat && m.lng && !isNaN(Number(m.lat)) && !isNaN(Number(m.lng)))
          .map(m => [
            Number(m.lat), // Sayıya çevirmeyi garantiye alalım
            Number(m.lng),
            m.status === 'dirty' ? 1.0 : 0.5
          ]);

        if (heatData.length > 0) {
          heatmapLayerRef.current = window.L.heatLayer(heatData, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            gradient: {
              0.4: 'blue',
              0.6: 'cyan',
              0.7: 'lime',
              0.8: 'yellow',
              1.0: 'red'
            }
          }).addTo(mapInstanceRef.current);
        }
      } else {
        console.warn("Leaflet Heat eklentisi henüz yüklenmedi.");
      }

    } else {
      markers.forEach(marker => {
        const isDirty = marker.status === 'dirty';
        const iconHtml = isDirty
          ? `<div class="relative flex items-center justify-center w-8 h-8">
                 <div class="absolute inset-0 bg-red-500 blur-md opacity-40 rounded-full animate-pulse"></div>
                 <div class="relative z-10 w-8 h-8 bg-red-600 border-2 border-white rounded-full shadow-md flex items-center justify-center text-white">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                 </div>
               </div>`
          : `<div class="relative flex items-center justify-center w-8 h-8">
                 <div class="absolute inset-0 bg-emerald-500 blur-md opacity-40 rounded-full"></div>
                 <div class="relative z-10 w-8 h-8 bg-emerald-600 border-2 border-white rounded-full shadow-md flex items-center justify-center text-white">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                 </div>
               </div>`;

        const customIcon = window.L.divIcon({
          className: 'custom-marker',
          html: iconHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const m = window.L.marker([marker.lat, marker.lng], { icon: customIcon });
        const imgUrl = getImageUrl(marker.image_url);

        m.bindTooltip(
          `<div style="
            text-align: left;
            padding: 5px;
            font-size: 14px;
            line-height: 1.2;
            min-width: 220px;
            max-width: 350px;
            white-space: normal;
            overflow-wrap: break-word;
            color: #1f2937; /* Gray-800 */
        ">
            <b style="font-size:16px; color:${isDirty ? '#dc2626' : '#059669'};">${isDirty ? "Kirlilik" : "Temizlendi"}</b><br/>

            <span style="font-size:13px; color:#4b5563; display:block; margin-top:4px;">
              ${marker.note}
            </span>

            ${imgUrl
            ? `<div style="display:flex; justify-content:center; margin-top:8px;">
                    <img src="${imgUrl}" 
                      style="
                         max-width:100%;
                         max-height:140px;
                         width:auto;
                         height:auto;
                         object-fit:contain;
                         border-radius:4px;
                         border: 1px solid #e5e7eb;
                      ">
                 </div>`
            : ""
          }
        </div>`,
          { direction: 'top', offset: [0, -35], opacity: 1, className: 'leaflet-tooltip-light' }
        );

        // POPUP Update
        m.bindPopup(`
            <div style="text-align:center; min-width:150px; font-family:sans-serif; color:#374151;">
                <h3 style="margin:0 0 5px 0; color:${isDirty ? '#dc2626' : '#059669'}">
                    ${isDirty ? 'Kirlilik Tespit' : 'Bölge Temiz'}
                </h3>
                <p style="margin:5px 0; font-size:13px;">${marker.note || ''}</p>
                ${imgUrl ? `<img src="${imgUrl}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px; margin-top:5px; border:1px solid #e5e7eb;">` : ''}
                ${!isDirty && marker.clean_image_url ? `<div style="font-size:10px; color:#6b7280; margin-top:5px;">(Temizlik Kanıtı Mevcut)</div>` : ''}
            </div>
        `);

        m.on('click', (e) => {
          if (isDirty) {
            e.target.closePopup();
            handleMarkerClick(marker);
          }
        });

        markersLayerRef.current.addLayer(m);
      });

      // Marker layer'ını haritaya ekle (Heatmap modunda değilsek)
      markersLayerRef.current.addTo(mapInstanceRef.current);
    }

  }, [markers, showHeatmap]); // showHeatmap bağımlılığını eklemeyi unutma!

  // Firebase Auth Dinleyicisi ve İstatistik Çekme
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserStats({
              score: data.score || 0,
              collected_count: data.collected_count || 0,
              rank_title: data.rank_title || 'Çevre Gönüllüsü'
            });
          } else {
            console.log("Kullanıcı verisi bulunamadı!");
          }
        } catch (error) {
          console.error("Firebase veri çekme hatası:", error);
        }
      } else {
        // Kullanıcı çıkış yaptıysa sıfırla
        setUserStats({ score: 0, collected_count: 0, rank_title: 'Ziyaretçi' });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchMarkers();
    const interval = setInterval(fetchMarkers, 2000);
    return () => clearInterval(interval);
  }, []);

  // Harita Başlatma ve Konum Alma
  useEffect(() => {
    const initMap = () => {
      if (!window.L || mapInitialized) return;

      delete window.L.Icon.Default.prototype._getIconUrl;
      window.L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setUserLocation({ lat: latitude, lng: longitude });
            setPermissionStatus("granted");

            const map = window.L.map(mapRef.current, {
              zoomControl: false,
              attributionControl: false
            }).setView([latitude, longitude], 15);

            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
              subdomains: 'abcd',
              maxZoom: 20,
              attribution: '&copy; OpenStreetMap &copy; CARTO'
            }).addTo(map);

            mapInstanceRef.current = map;
            markersLayerRef.current = window.L.layerGroup().addTo(map);

            const userIcon = window.L.divIcon({
              className: 'custom-user-icon',
              html: '<div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg animate-pulse"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });
            window.L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup("Sizin Konumunuz");

            // Menzil Çemberi (Daha koyu yeşil border)
            window.L.circle([latitude, longitude], {
              color: '#059669', // emerald-600
              fillColor: '#10b981', // emerald-500
              fillOpacity: 0.1,
              radius: DISTANCE,
              weight: 1,
              dashArray: '10, 10'
            }).addTo(map);

            map.on('click', (e) => {
              handleMapClick(e.latlng.lat, e.latlng.lng);
            });

            setMapInitialized(true);
          },
          (error) => {
            console.error(error);
            setPermissionStatus("denied");
            const defaultLat = 41.0082;
            const defaultLng = 28.9784;

            const map = window.L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([defaultLat, defaultLng], 13);
            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
            mapInstanceRef.current = map;
            markersLayerRef.current = window.L.layerGroup().addTo(map);
            map.on('click', (e) => handleMapClick(e.latlng.lat, e.latlng.lng));
            setMapInitialized(true);
          }
        );
      }
    };

    const checkLeaflet = setInterval(() => { if (window.L) { initMap(); clearInterval(checkLeaflet); } }, 100);
    return () => clearInterval(checkLeaflet);
  }, []);

  const handleFileClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleMapClick = (lat, lng) => {
    if (activeModal) return;

    if (!locationRef.current) {
      setDistanceAlert("Konumunuz henüz alınamadı. İşaretleme yapmak için bekleyin.");
      setTimeout(() => setDistanceAlert(null), 3000);
      return;
    }

    const dist = getDistanceFromLatLonInMeters(locationRef.current.lat, locationRef.current.lng, lat, lng);

    if (dist > DISTANCE) {
      setDistanceAlert(`Çok uzaksınız (${Math.round(dist)}m). Sadece 250m yakınınızdaki alanları işaretleyebilirsiniz.`);
      setTimeout(() => setDistanceAlert(null), 4000);
      return;
    }

    setSelectedLocation({ lat, lng });
    setActiveModal('report');
    setSelectedFile(null);
    setNoteInput("");
  };

  const fetchLeaderboard = async () => {
    setIsLeaderboardLoading(true); // Yükleme başladı
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("score", "desc"), limit(20));

      const querySnapshot = await getDocs(q);
      const leaderboardData = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.score > 0) { // Sadece puanı olanları al
          leaderboardData.push({
            id: doc.id,
            name: data.fullName || "Gizli Kahraman",
            score: data.score || 0,
            photoURL: data.photoURL || null,
            initials: data.fullName
              ? data.fullName.substring(0, 2).toUpperCase()
              : "??"
          });
        }
      });

      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error("Lider tablosu çekilemedi:", error);
    } finally {
      setIsLeaderboardLoading(false); // Yükleme bitti
    }
  };

  const handleMarkerClick = (marker) => {
    if (marker.status === 'dirty') {
      if (userLocation) {
        const dist = getDistanceFromLatLonInMeters(userLocation.lat, userLocation.lng, marker.lat, marker.lng);
        if (dist > DISTANCE) {
          setDistanceAlert(`Bu bölgeye çok uzaksınız (${Math.round(dist / 1000)}km). Temizlemek için 3km yakınında olmalısınız.`);
          setTimeout(() => setDistanceAlert(null), 4000);
          return;
        }
      } else {
        setDistanceAlert("Konumunuz henüz alınamadı. Lütfen bekleyin.");
        setTimeout(() => setDistanceAlert(null), 3000);
        return;
      }

      setSelectedMarkerId(marker.id);
      setActiveModal('clean');
      setSelectedFile(null);
    }
  };

  const handleSubmitReport = async () => {
    if (!selectedLocation || !selectedFile) return;
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('lat', selectedLocation.lat);
    formData.append('lng', selectedLocation.lng);
    formData.append('note', noteInput || 'Atık tespiti.');
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_URL}/api/markers`, { method: 'POST', body: formData });
      if (response.ok) {
        if (currentUser) {
          const userRef = doc(db, "users", currentUser.uid);

          await updateDoc(userRef, {
            score: increment(50) // Puanı 50 artır
          }).catch((err) => console.error("Puan güncellenemedi:", err));

          setUserStats(prev => ({
            ...prev,
            score: prev.score + 50
          }));
        }

        await fetchMarkers();
        setActiveModal(null);
        setSelectedLocation(null);
        setDistanceAlert("İhbar alındı! +50 Puan kazandın.");
        setTimeout(() => setDistanceAlert(null), 3000);

      } else {
        const errorData = await response.json();
        alert(`Hata: ${errorData.detail || "Sunucu hatası"}`);
      }
    } catch (error) {
      console.error("Gönderme Hatası:", error);
      alert("Sunucuya bağlanılamadı!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmitClean = async () => {
    if (!selectedMarkerId || !selectedFile) return;
    if (!userLocation) { alert("Konumunuz alınamıyor."); return; }
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('user_lat', userLocation.lat);
    formData.append('user_lng', userLocation.lng);

    try {
      const response = await fetch(`${API_URL}/api/markers/${selectedMarkerId}/clean`, { method: 'PUT', body: formData });

      if (response.ok) {
        if (currentUser) {
          const userRef = doc(db, "users", currentUser.uid);

          await updateDoc(userRef, {
            score: increment(100),       // Puanı 100 artır
            collected_count: increment(1) // Toplanan çöpü 1 artır
          }).catch((err) => console.error("Puan güncellenemedi:", err));

          setUserStats(prev => ({
            ...prev,
            score: prev.score + 100,
            collected_count: prev.collected_count + 1
          }));
        }

        await fetchMarkers();
        setActiveModal(null);
        setSelectedMarkerId(null);
        setDistanceAlert("Bölge temizlendi! +100 Puan kazandın.");
        setTimeout(() => setDistanceAlert(null), 3000);
      } else {
        const err = await response.json();
        setDistanceAlert(err.detail || "Bir hata oluştu");
        setTimeout(() => setDistanceAlert(null), 4000);
      }
    } catch (error) {
      console.error("Güncelleme Hatası:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const centerMapOnUser = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 16);
    }
  };

  // --- JSX RENDER ---
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden relative">

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      {/* Profil Modal İçeriği */}
      {isProfileOpen && (
        <div className="absolute top-24 right-5 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Modal Header */}
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-3">
              {/* Profil Resmi: Varsa Firebase fotosu, yoksa Baş harf */}
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-9 h-9 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
                  {currentUser?.displayName ? currentUser.displayName.charAt(0).toUpperCase() : "M"}
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-800 text-sm">
                  {currentUser?.displayName || "Misafir Kullanıcı"}
                </h3>
                <p className="text-xs text-gray-500">
                  {userStats.rank_title}
                </p>
              </div>
            </div>
            <button onClick={() => setIsProfileOpen(false)} className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 p-1 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* İstatistikler */}
          <div className="p-3 grid grid-cols-2 gap-2">
            <div className="bg-green-50/50 p-3 rounded-lg border border-green-100 flex flex-col items-center text-center">
              <Trash2 size={18} className="text-green-600 mb-1" />
              <span className="text-lg font-bold text-gray-800">
                {userStats.collected_count}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">Çöp Toplandı</span>
            </div>

            <div className="bg-orange-50/50 p-3 rounded-lg border border-orange-100 flex flex-col items-center text-center">
              <Trophy size={18} className="text-orange-500 mb-1" />
              <span className="text-lg font-bold text-gray-800">
                {userStats.score}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">Toplam Puan</span>
            </div>
          </div>

          {/* Log Out Butonu */}
          {currentUser ? (
            <div className="p-2 border-t border-gray-100">
              <button onClick={() => { auth.signOut(); setIsProfileOpen(false); }} className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors text-sm font-medium">
                <LogOut size={16} />
                Çıkış Yap
              </button>
            </div>
          ) : (
            <div className="p-2 border-t border-gray-100">
              {/* Eğer giriş yapılmamışsa Giriş butonu gösterilebilir */}
              <button onClick={() => alert("Giriş sayfasına yönlendir...")} className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors text-sm font-medium">
                <User size={16} />
                Giriş Yap
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- Header --- */}
      <header className="absolute top-0 left-0 right-0 z-[1000] bg-gradient-to-b from-white/95 to-transparent p-4 pt-6 pointer-events-none">
        <div className="flex justify-between items-center pointer-events-auto px-1">
          <div className="flex items-center gap-2">
            <div className="bg-white p-2 rounded-lg shadow-md border border-gray-100">
              <img src="/logo3.png" alt="Logo" className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 drop-shadow-sm">trasHunter</h1>
              <p className="text-xs text-emerald-600 font-bold">
                {userLocation ? 'Konum: Aktif' : 'Konum Aranıyor...'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-12 h-12 rounded-full bg-gray-100  border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50 hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300"
          >
            <User className="text-gray-900 w-6 h-6" />
          </button>
        </div>
      </header>

      {/* --- Toast / Alerts --- */}
      {distanceAlert && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[3000] animate-in slide-in-from-top-5 fade-in duration-300 w-[90%] max-w-sm">
          <div className={`backdrop-blur-md p-4 rounded-xl shadow-xl border flex items-start gap-3 
            ${distanceAlert.includes("!")
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-800"
              : "bg-red-50/95 border-red-200 text-red-800"}`}>
            <AlertTriangle className="shrink-0" size={24} />
            <div className="flex-1">
              <h4 className="font-bold text-sm">{distanceAlert.includes("!") ? "Başarılı" : "Uyarı"}</h4>
              <p className="text-xs opacity-90 font-medium">{distanceAlert}</p>
            </div>
            <button onClick={() => setDistanceAlert(null)} className="shrink-0 hover:opacity-60 transition-opacity"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* --- Map Area --- */}
      <div className="flex-1 relative z-0">
        {/* Map Container */}
        <div ref={mapRef} className="w-full h-full bg-gray-200" id="map"></div>

        {permissionStatus === 'denied' && (
          <div className="absolute inset-0 z-[2000] bg-white/80 flex items-center justify-center p-6 text-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl border border-red-100 shadow-xl max-w-sm">
              <Navigation size={48} className="mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-bold mb-2 text-gray-900">Konum Erişimi Gerekli</h2>
              <p className="text-gray-500 text-sm mb-6">Haritayı kullanmak ve temizlik yapmak için konum izni şarttır.</p>
              <button onClick={() => window.location.reload()} className="bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors">Yenile</button>
            </div>
          </div>
        )}
      </div>

      {/* --- Floating Buttons --- */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-4 z-[1000]">
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`w-12 h-12 flex items-center justify-center rounded-full shadow-lg transform hover:scale-105 active:scale-95 transition-all
      ${showHeatmap
              ? 'bg-orange-600 text-white ring-4 ring-orange-200' // Aktifken daha koyu ve halkalı
              : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30' // Pasifken normal kırmızı
            }`}
        >
          {/* Eğer heatmap açıksa alev dolu, kapalıysa normal */}
          <Flame size={24} fill={showHeatmap ? "currentColor" : "none"} />
        </button>
        <button
          onClick={centerMapOnUser}
          className="bg-blue-600 hover:bg-blue-500 w-12 h-12 flex items-center justify-center rounded-full shadow-lg border border-gray-200 transform hover:scale-105 active:scale-95 transition-all">
          <Crosshair size={24} className="text-white" />
        </button>
        <button
          onClick={() => setActiveModal('leaderboard')}
          className="bg-yellow-400 hover:bg-yellow-500 text-white w-12 h-12 flex items-center justify-center rounded-full shadow-lg shadow-yellow-400/30 transform hover:scale-105 active:scale-95 transition-all">
          <Trophy size={24} />
        </button>
        <button onClick={() => userLocation ? handleMapClick(userLocation.lat, userLocation.lng) : alert("Konum bekleniyor...")} className="bg-emerald-600 hover:bg-emerald-700 text-white w-12 h-12 flex items-center justify-center rounded-full shadow-lg shadow-emerald-600/30 transform hover:scale-105 active:scale-95">
          <Plus size={24} />
        </button>
      </div>

      {/* --- Bottom Status Bar --- */}
      <div className="absolute bottom-6 left-6 z-[1000]">
        <div className="bg-white/90 backdrop-blur-md p-3 rounded-xl border border-gray-200 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-xs font-bold text-gray-700">{markers.filter(m => m.status === 'dirty').length} Kirli</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-gray-700">{markers.filter(m => m.status === 'cleaned').length} Temiz</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Report Modal --- */}
      {activeModal === 'report' && (
        <div className="absolute inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 border border-gray-100">
            {isAnalyzing ? (
              <div className="p-10 flex flex-col items-center justify-center text-center space-y-4">
                <Loader2 size={48} className="text-emerald-600 animate-spin" />
                <div><h3 className="text-lg font-bold text-gray-900">Yükleniyor...</h3><p className="text-sm text-gray-500">Yapay zeka analizi yapılıyor.</p></div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><MapPin className="text-red-500" size={18} /> Kirlilik Bildir</h3>
                  <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div onClick={handleFileClick} className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${selectedFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'}`}>
                    {selectedFile ? (
                      <div className="text-emerald-600 flex flex-col items-center"><CheckCircle2 size={32} className="mb-2" /><span className="text-sm font-medium">Fotoğraf Seçildi</span></div>
                    ) : (
                      <div className="text-gray-500 flex flex-col items-center"><Camera size={32} className="mb-2" /><span className="text-sm">Fotoğraf Seç</span></div>
                    )}
                  </div>
                  <input type="text" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Açıklama" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                  <button onClick={handleSubmitReport} disabled={!selectedFile} className={`w-full py-3 rounded-xl font-bold text-lg shadow-md ${selectedFile ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 text-gray-400'}`}>Bildir</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeModal === 'clean' && (
        <div className="absolute inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 border border-gray-100">
            {isAnalyzing ? (
              <div className="p-10 flex flex-col items-center justify-center text-center space-y-4">
                <Loader2 size={48} className="text-emerald-600 animate-spin" />
                <div><h3 className="text-lg font-bold text-gray-900">İşleniyor...</h3><p className="text-sm text-gray-500">Temizlik doğrulanıyor.</p></div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><CheckCircle2 className="text-emerald-600" size={18} /> Temizle</h3>
                  <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                
                <div className="p-5 space-y-4">
                  
                  {/* --- YENİ EKLENEN: YOL TARİFİ BUTONU --- */}
                  {(() => {
                    // Seçili marker'ın verisini bul
                    const targetMarker = markers.find(m => m.id === selectedMarkerId);
                    if (targetMarker) {
                      return (
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${targetMarker.lat},${targetMarker.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 px-4 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm border border-blue-200 flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors shadow-sm"
                        >
                          <Navigation size={18} className="fill-blue-700 text-blue-700" />
                          Google Maps ile Yol Tarifi Al
                        </a>
                      );
                    }
                    return null;
                  })()}
                  {/* --------------------------------------- */}

                  <div onClick={handleFileClick} className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${selectedFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'}`}>
                    {selectedFile ? (
                      <div className="text-emerald-600 flex flex-col items-center"><CheckCircle2 size={32} className="mb-2" /><span className="text-sm font-medium">Kanıt Seçildi</span></div>
                    ) : (
                      <div className="text-gray-500 flex flex-col items-center"><Camera size={32} className="mb-2" /><span className="text-sm">Son Halini Seç</span></div>
                    )}
                  </div>
                  
                  <button onClick={handleSubmitClean} disabled={!selectedFile} className={`w-full py-3 rounded-xl font-bold text-lg shadow-md ${selectedFile ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 text-gray-400'}`}>Temizlendi İşaretle</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Leaderboard Modal  --- */}
      {activeModal === 'leaderboard' && (
        <div className="absolute inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 max-h-[80vh] flex flex-col border border-gray-100">

            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Trophy className="text-yellow-500" size={20} />
                <span className="text-gray-800">Haftalık Lider Tablosu</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar space-y-3 bg-white">

              {/* Yükleniyor Durumu */}
              {isLeaderboardLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Loader2 className="animate-spin mb-2" size={32} />
                  <p className="text-sm">Sıralama yükleniyor...</p>
                </div>
              ) : leaderboard.length === 0 ? (
                /* Veri Yoksa */
                <div className="text-center py-10 text-gray-500">
                  <p>Henüz sıralamaya giren kimse yok.</p>
                </div>
              ) : (
                /* Veri Varsa Listele (TEK MAP KULLANARAK) */
                leaderboard.map((user, index) => {
                  let rankStyle = "bg-white border-gray-100 text-gray-500 hover:shadow-md";
                  let rankIcon = <span className="font-mono font-bold w-6 text-center text-gray-400">{index + 1}</span>;

                  if (index === 0) {
                    rankStyle = "bg-yellow-50 border-yellow-200 text-yellow-700 shadow-sm";
                    rankIcon = <Medal size={22} className="text-yellow-500" />;
                  } else if (index === 1) {
                    rankStyle = "bg-gray-50 border-gray-200 text-gray-700 shadow-sm";
                    rankIcon = <Medal size={22} className="text-gray-400" />;
                  } else if (index === 2) {
                    rankStyle = "bg-orange-50 border-orange-200 text-orange-800 shadow-sm";
                    rankIcon = <Medal size={22} className="text-orange-500" />;
                  }

                  return (
                    <div key={user.id} className={`flex items-center gap-4 p-3 rounded-xl border ${rankStyle} transition-all`}>
                      <div className="flex-shrink-0 flex items-center justify-center w-8">
                        {rankIcon}
                      </div>

                      <div className="flex-1 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-gray-200 text-gray-600 overflow-hidden border border-gray-300`}>
                          {user.photoURL ? (
                            <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{user.initials}</span>
                          )}
                        </div>

                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-gray-800">{user.name}</span>
                          {currentUser && currentUser.uid === user.id && (
                            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">(SEN)</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`block font-bold text-lg ${index === 0 ? 'text-yellow-600' : 'text-emerald-600'}`}>
                          {user.score}
                        </span>
                        <span className="text-[10px] text-gray-400">PUAN</span>
                      </div>
                    </div>
                  );
                })
              )}

              <div className="mt-6 text-center p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <p className="text-sm text-emerald-700 font-medium">Sen de çevreyi temizle, sıralamada yüksel!</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}