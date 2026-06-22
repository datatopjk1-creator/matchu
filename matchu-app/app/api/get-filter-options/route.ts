// app/api/get-filter-options/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ── KOTA LENGKAP INDONESIA ────────────────────────────────
const KOTA_STATIS = [
  // DKI Jakarta
  'Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara',
  // Jawa Barat
  'Bandung','Bekasi','Depok','Bogor','Cimahi','Tasikmalaya','Sukabumi','Cirebon',
  'Karawang','Purwakarta','Subang','Garut','Cianjur','Sumedang','Kuningan','Majalengka',
  'Ciamis','Pangandaran','Indramayu','Banjar',
  // Jawa Tengah
  'Semarang','Solo','Surakarta','Salatiga','Magelang','Pekalongan','Tegal','Kudus',
  'Jepara','Demak','Purwokerto','Cilacap','Kebumen','Wonosobo','Temanggung',
  'Boyolali','Klaten','Wonogiri','Rembang','Blora','Grobogan','Pati','Brebes',
  'Batang','Pemalang','Kendal','Sragen','Karanganyar','Purbalingga','Banjarnegara',
  // DI Yogyakarta
  'Yogyakarta','Sleman','Bantul','Gunungkidul','Kulonprogo',
  // Jawa Timur
  'Surabaya','Malang','Sidoarjo','Gresik','Mojokerto','Pasuruan','Probolinggo',
  'Kediri','Blitar','Madiun','Jember','Banyuwangi','Jombang','Lumajang','Tuban',
  'Lamongan','Bojonegoro','Ngawi','Ponorogo','Magetan','Pacitan','Trenggalek',
  'Bondowoso','Situbondo','Pamekasan','Sampang','Sumenep','Bangkalan','Nganjuk',
  'Tulungagung',
  // Banten
  'Tangerang','Tangerang Selatan','Serang','Cilegon','Lebak','Pandeglang',
  // Bali
  'Denpasar','Badung','Gianyar','Tabanan','Buleleng','Karangasem','Klungkung',
  'Bangli','Jembrana',
  // Sumatera Utara
  'Medan','Binjai','Tebing Tinggi','Pematangsiantar','Tanjungbalai','Sibolga',
  'Padangsidempuan','Deli Serdang','Langkat','Karo','Simalungun','Asahan',
  // Sumatera Barat
  'Padang','Bukittinggi','Payakumbuh','Solok','Sawahlunto','Pariaman','Padangpanjang',
  'Pasaman','Sijunjung','Dharmasraya','Lima Puluh Kota',
  // Sumatera Selatan
  'Palembang','Lubuklinggau','Prabumulih','Pagar Alam','Banyuasin','Musi Banyuasin',
  'Ogan Komering Ilir','Muara Enim',
  // Aceh
  'Banda Aceh','Lhokseumawe','Langsa','Sabang','Subulussalam','Aceh Besar',
  'Bireuen','Pidie',
  // Riau
  'Pekanbaru','Dumai','Kampar','Bengkalis','Siak','Rokan Hilir','Indragiri Hulu',
  // Kepulauan Riau
  'Batam','Tanjungpinang','Bintan','Karimun',
  // Jambi
  'Jambi','Sungai Penuh','Batanghari','Muaro Jambi','Bungo','Tebo',
  // Bengkulu
  'Bengkulu','Rejang Lebong','Kepahiang',
  // Lampung
  'Bandar Lampung','Metro','Lampung Selatan','Lampung Tengah','Lampung Utara',
  'Pringsewu','Pesawaran','Tanggamus',
  // Bangka Belitung
  'Pangkalpinang','Bangka','Belitung',
  // Kalimantan Barat
  'Pontianak','Singkawang','Mempawah','Kubu Raya','Sanggau','Sintang','Ketapang',
  // Kalimantan Tengah
  'Palangka Raya','Kotawaringin Barat','Kotawaringin Timur','Kapuas','Barito Selatan',
  // Kalimantan Selatan
  'Banjarmasin','Banjarbaru','Banjar','Barito Kuala','Tapin','Hulu Sungai Selatan',
  'Hulu Sungai Utara','Tabalong','Tanah Laut',
  // Kalimantan Timur
  'Samarinda','Balikpapan','Bontang','Kutai Kartanegara','Berau','Penajam Paser Utara',
  // Kalimantan Utara
  'Tarakan','Nunukan','Tanjung Selor','Bulungan','Malinau',
  // Sulawesi Selatan
  'Makassar','Parepare','Palopo','Gowa','Maros','Bone','Wajo','Sidrap',
  'Pinrang','Enrekang','Bantaeng','Jeneponto','Takalar','Selayar','Sinjai',
  // Sulawesi Tengah
  'Palu','Parigi Moutong','Donggala','Poso','Toli-Toli','Morowali','Banggai',
  // Sulawesi Tenggara
  'Kendari','Baubau','Kolaka','Konawe','Muna','Buton',
  // Sulawesi Utara
  'Manado','Bitung','Tomohon','Kotamobagu','Minahasa','Bolaang Mongondow',
  // Sulawesi Barat
  'Mamuju','Majene','Polewali Mandar',
  // Gorontalo
  'Gorontalo','Bone Bolango','Pohuwato',
  // Maluku
  'Ambon','Tual','Maluku Tengah','Seram Bagian Barat','Aru',
  // Maluku Utara
  'Ternate','Tidore Kepulauan','Halmahera Utara','Halmahera Selatan',
  // Papua Barat
  'Sorong','Manokwari','Fakfak','Raja Ampat',
  // Papua
  'Jayapura','Merauke','Timika','Biak','Nabire','Yahukimo','Pegunungan Bintang',
  // Nusa Tenggara Barat
  'Mataram','Bima','Sumbawa','Dompu','Sumbawa Barat','Lombok Barat',
  'Lombok Tengah','Lombok Timur','Lombok Utara',
  // Nusa Tenggara Timur
  'Kupang','Ende','Maumere','Labuan Bajo','Manggarai','Flores Timur',
  'Sumba Barat','Sumba Timur','Timor Tengah Selatan','Timor Tengah Utara',
  // Khusus/Lainnya
  'Depok','Bekasi','Tangerang','Bogor','Luar Negeri',
];

// ── UNIVERSITAS LENGKAP ───────────────────────────────────
const UNIV_STATIS = [
  // PTN Utama
  'Universitas Indonesia','Universitas Gadjah Mada','Institut Teknologi Bandung',
  'Institut Pertanian Bogor (IPB University)','Institut Teknologi Sepuluh Nopember',
  'Universitas Airlangga','Universitas Diponegoro','Universitas Brawijaya',
  'Universitas Padjadjaran','Universitas Hasanuddin','Universitas Sumatera Utara',
  'Universitas Sebelas Maret','Universitas Pendidikan Indonesia','Universitas Andalas',
  'Universitas Sriwijaya','Universitas Udayana','Universitas Riau','Universitas Syiah Kuala',
  'Universitas Negeri Yogyakarta','Universitas Negeri Malang','Universitas Negeri Jakarta',
  'Universitas Negeri Semarang','Universitas Negeri Surabaya','Universitas Negeri Makassar',
  'Universitas Negeri Padang','Universitas Negeri Manado','Universitas Negeri Gorontalo',
  'Universitas Tanjungpura','Universitas Mulawarman','Universitas Lambung Mangkurat',
  'Universitas Palangka Raya','Universitas Haluoleo','Universitas Pattimura',
  'Universitas Cenderawasih','Universitas Khairun','Universitas Papua',
  'Universitas Nusa Cendana','Universitas Mataram','Universitas Tadulako',
  'Universitas Bengkulu','Universitas Bangka Belitung','Universitas Terbuka',
  'Institut Teknologi Kalimantan','Institut Teknologi Sumatera',
  'Universitas Jenderal Soedirman','Universitas Trunojoyo Madura',
  'Universitas Tidar','Universitas Malikussaleh','Universitas Samudra',
  'Universitas Teuku Umar','Universitas Sultan Ageng Tirtayasa',
  'Universitas Singaperbangsa Karawang','Universitas Siliwangi',
  'Universitas Jember','Universitas Pembangunan Nasional Veteran',
  // PTS Terkenal
  'BINUS University','Universitas Pelita Harapan','Universitas Trisakti',
  'Universitas Tarumanagara','Universitas Gunadarma','Universitas Telkom',
  'Universitas Mercu Buana','President University','Universitas Islam Indonesia',
  'Universitas Muhammadiyah Yogyakarta','Universitas Muhammadiyah Malang',
  'Universitas Ahmad Dahlan','Universitas Kristen Satya Wacana','Universitas Sanata Dharma',
  'Universitas Dian Nuswantoro','Universitas Komputer Indonesia','Universitas Widyatama',
  'Universitas Bakrie','Universitas Paramadina','Universitas Prasetiya Mulya',
  'Universitas Bina Nusantara','Universitas Ciputra','Universitas Petra Surabaya',
  'Universitas Kristen Duta Wacana','Universitas Atmajaya Yogyakarta',
  'Universitas Katolik Indonesia Atma Jaya','Universitas Pancasila',
  'Universitas Esa Unggul','Universitas Nasional','Universitas Yarsi',
  'Universitas Parahyangan','Universitas Katolik Soegijapranata',
  'Universitas Kristen Petra','Universitas Surabaya',
  'Universitas 17 Agustus 1945 Surabaya','Universitas Wijaya Kusuma Surabaya',
  'Universitas Muhammadiyah Surabaya','Universitas Muhammadiyah Surakarta',
  'Universitas Muhammadiyah Semarang','Universitas Muhammadiyah Makassar',
  'Universitas Muhammadiyah Palembang','Universitas Muhammadiyah Bandung',
  'Universitas Muhammadiyah Jakarta','Universitas Muhammadiyah Tangerang',
  'STIE YKPN Yogyakarta','Sekolah Tinggi Ilmu Ekonomi Indonesia',
  'Institut Bisnis dan Informatika Kesatuan',
  // UIN / IAIN / STAIN
  'Universitas Islam Negeri Syarif Hidayatullah Jakarta',
  'Universitas Islam Negeri Sunan Kalijaga Yogyakarta',
  'Universitas Islam Negeri Maulana Malik Ibrahim Malang',
  'Universitas Islam Negeri Sunan Ampel Surabaya',
  'Universitas Islam Negeri Walisongo Semarang',
  'Universitas Islam Negeri Alauddin Makassar',
  'Universitas Islam Negeri Sunan Gunung Djati Bandung',
  'Universitas Islam Negeri Raden Fatah Palembang',
  'Universitas Islam Negeri Imam Bonjol Padang',
  'Universitas Islam Negeri Ar-Raniry Banda Aceh',
  'UIN Sultan Syarif Kasim Riau','UIN Mataram','UIN Antasari Banjarmasin',
  'UIN Raden Intan Lampung','UIN Sultan Aji Muhammad Idris Samarinda',
  'UIN Sulthan Thaha Saifuddin Jambi','UIN Datokarama Palu',
  // Politeknik
  'Politeknik Negeri Jakarta','Politeknik Negeri Bandung','Politeknik Negeri Semarang',
  'Politeknik Negeri Surabaya','Politeknik Negeri Malang','Politeknik Negeri Medan',
  'Politeknik Negeri Makassar','Politeknik Negeri Padang','Politeknik Negeri Bali',
  'Politeknik Negeri Banjarmasin','Politeknik Negeri Kupang','Politeknik Negeri Ambon',
  'Politeknik Perkapalan Negeri Surabaya','Politeknik Elektronika Negeri Surabaya',
  'Politeknik Manufaktur Negeri Bandung','Politeknik Negeri Batam',
  'Politeknik Kesehatan Kemenkes Jakarta','Politeknik Kesehatan Kemenkes Bandung',
  'Politeknik Kesehatan Kemenkes Surabaya','Politeknik Kesehatan Kemenkes Yogyakarta',
  'Politeknik Kesehatan Kemenkes Semarang','Politeknik Kesehatan Kemenkes Malang',
  'Politeknik Kesehatan Kemenkes Medan','Politeknik Kesehatan Kemenkes Makassar',
  'Politeknik Kesehatan Kemenkes Denpasar','Politeknik Kesehatan Kemenkes Pontianak',
  // Kedinasan
  'Politeknik Keuangan Negara STAN (PKN STAN)',
  'Sekolah Tinggi Ilmu Statistik (STIS)',
  'Institut Pemerintahan Dalam Negeri (IPDN)',
  'Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG)',
  'Sekolah Tinggi Intelijen Negara (STIN)',
  'Politeknik Imigrasi (Poltekim)','Politeknik Ilmu Pemasyarakatan (Poltekip)',
  'Sekolah Tinggi Pertanahan Nasional (STPN)',
  'Sekolah Tinggi Transportasi Darat (STTD)',
  'Politeknik Penerbangan Indonesia Curug',
  'Politeknik Penerbangan Makassar','Politeknik Penerbangan Surabaya',
  'Sekolah Tinggi Pariwisata Bandung (NHI Bandung)','Sekolah Tinggi Pariwisata Bali',
  'Sekolah Tinggi Sandi Negara (STSN)',
  'Sekolah Tinggi Ilmu Pelayaran (STIP Jakarta)',
  'Politeknik Pelayaran Surabaya','Politeknik Pelayaran Makassar',
  'Politeknik Pelayaran Semarang','Politeknik Pelayaran Barombong',
  'Akademi Kepolisian (Akpol)','Akademi Militer (Akmil)',
  'Akademi Angkatan Laut (AAL)','Akademi Angkatan Udara (AAU)',
  'Sekolah Tinggi Ilmu Kepolisian (STIK-PTIK)',
  'Universitas Pertahanan Indonesia (UNHAN)',
];

// ── PROGRAM STUDI LENGKAP ─────────────────────────────────
const PRODI_STATIS = [
  // Sains & Teknologi
  'Teknik Informatika','Ilmu Komputer','Sistem Informasi','Teknologi Informasi',
  'Teknik Elektro','Teknik Sipil','Teknik Mesin','Teknik Industri','Teknik Kimia',
  'Teknik Lingkungan','Teknik Arsitektur','Arsitektur','Teknik Perkapalan',
  'Teknik Penerbangan','Teknik Biomedis','Teknik Material','Teknik Metalurgi',
  'Teknik Geologi','Teknik Perminyakan','Teknik Pertambangan','Teknik Nuklir',
  'Matematika','Statistika','Fisika','Kimia','Biologi','Biokimia','Ilmu Aktuaria',
  'Teknologi Pangan','Teknologi Pertanian','Agroteknologi','Agribisnis',
  'Peternakan','Perikanan','Kehutanan','Geografi','Geologi','Geodesi',
  'Astronomi','Meteorologi','Klimatologi','Oceanografi','Ilmu Kelautan',
  'Budidaya Perairan','Manajemen Sumber Daya Perairan',
  // Kesehatan
  'Kedokteran','Kedokteran Gigi','Keperawatan','Kebidanan','Farmasi',
  'Kesehatan Masyarakat','Gizi','Fisioterapi','Radiologi','Analis Kesehatan',
  'Rekam Medis','Teknik Gigi','Ortotik Prostetik','Kesehatan Lingkungan',
  'Administrasi Rumah Sakit','Kedokteran Hewan','Optometri','Okupasi Terapi',
  'Terapi Wicara','Promosi Kesehatan',
  // Ekonomi & Bisnis
  'Manajemen','Akuntansi','Ekonomi Pembangunan','Bisnis Digital',
  'Administrasi Bisnis','Manajemen Keuangan','Manajemen Pemasaran',
  'Manajemen Sumber Daya Manusia','Ekonomi Syariah','Perbankan Syariah',
  'Keuangan dan Perbankan','Perpajakan','Manajemen Logistik',
  'Bisnis Internasional','Kewirausahaan','Manajemen Ritel',
  'Akuntansi Pemerintahan','Administrasi Pajak','Kepabeanan dan Cukai',
  'Administrasi Keuangan Negara',
  // Sosial & Humaniora
  'Ilmu Komunikasi','Hubungan Internasional','Ilmu Politik','Sosiologi',
  'Antropologi','Psikologi','Hukum','Ilmu Administrasi Negara',
  'Ilmu Administrasi Bisnis','Kriminologi','Hubungan Masyarakat',
  'Jurnalistik','Penyiaran','Ilmu Perpustakaan','Ilmu Informasi',
  'Arkeologi','Sejarah','Filsafat','Ilmu Kesejahteraan Sosial',
  // Pendidikan
  'Pendidikan Guru Sekolah Dasar (PGSD)','Pendidikan Anak Usia Dini (PAUD)',
  'Pendidikan Bahasa Inggris','Pendidikan Bahasa Indonesia',
  'Pendidikan Matematika','Pendidikan Fisika','Pendidikan Kimia',
  'Pendidikan Biologi','Pendidikan Sejarah','Pendidikan Geografi',
  'Pendidikan Ekonomi','Pendidikan Teknik Informatika',
  'Bimbingan dan Konseling','Teknologi Pendidikan','Administrasi Pendidikan',
  'Pendidikan Jasmani','Pendidikan Seni','Pendidikan Pancasila dan Kewarganegaraan',
  // Seni & Desain
  'Desain Komunikasi Visual','Desain Produk','Desain Interior',
  'Seni Rupa','Seni Murni','Kriya','Fotografi','Film dan Televisi',
  'Animasi','Game Technology','Seni Musik','Seni Tari','Seni Teater','Kriya Tekstil',
  // Bahasa & Sastra
  'Sastra Indonesia','Sastra Inggris','Sastra Jepang','Sastra Mandarin',
  'Sastra Arab','Sastra Jerman','Sastra Prancis','Sastra Korea',
  'Linguistik','Penerjemahan','Sastra Belanda','Sastra Rusia',
  // Pariwisata & Perhotelan
  'Pariwisata','Manajemen Perhotelan','Manajemen Destinasi Wisata',
  'Tata Boga','Tata Rias','Seni Kuliner',
  // Agama & Dakwah
  'Pendidikan Agama Islam','Hukum Keluarga Islam','Ekonomi Syariah',
  'Komunikasi dan Penyiaran Islam','Bimbingan Konseling Islam',
  'Ilmu Al-Quran dan Tafsir','Hadits','Aqidah dan Filsafat Islam',
  // Kedinasan & Militer
  'Ilmu Pemerintahan','Statistika Pemerintahan','Komputasi Statistik',
  'Teknik Navigasi Udara','Teknik Listrik Bandara','Teknik Mekanikal Bandara',
  'Manajemen Transportasi Udara','Manajemen Transportasi Laut',
  'Nautika','Teknika','Ketatalaksanaan Pelayaran Niaga',
  'Imigrasi','Pemasyarakatan','Pertanahan',
];

const JENJANG_STATIS = ['D1','D2','D3','D4','S1','S2','S3','Diploma Kedinasan','Sarjana Terapan','Profesi','Spesialis'];
const AGAMA_STATIS = ['Islam','Kristen Protestan','Katolik','Hindu','Buddha','Konghucu'];
const TARGET_STATIS = ['Kurang dari 1 tahun','1 sampai 2 tahun','2 sampai 3 tahun','Fleksibel'];
const KEPRIBADIAN_STATIS = ['Introvert','Ekstrovert','Ambivert'];
const MBTI_STATIS = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

const UNIQ = (arr: string[]) =>
  [...new Set(arr.filter(Boolean))].sort((a,b) => a.localeCompare(b,'id'));

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    let lawanJenis: string | null = null;
    if (userId) {
      const { data: me } = await supabase
        .from('profiles')
        .select('jenis_kelamin')
        .eq('id', userId)
        .limit(1);
      const g = me?.[0]?.jenis_kelamin;
      lawanJenis = g === 'Pria' ? 'Wanita' : 'Pria';
    }

    let query = supabase
      .from('profiles')
      .select('kota_domisili,kota_asal,universitas,program_studi,profesi,jenjang,agama,target_menikah,kepribadian,mbti')
      .eq('status','aktif');
    if (lawanJenis) query = query.eq('jenis_kelamin', lawanJenis);

    const { data } = await query;
    const d = data || [];

    // Gabungkan DB + statis untuk masing-masing field
    const kotaDB    = [...d.map(r=>r.kota_domisili), ...d.map(r=>r.kota_asal)] as string[];
    const univDB    = d.map(r=>r.universitas) as string[];
    const prodiDB   = d.map(r=>r.program_studi) as string[];
    const jenjangDB = d.map(r=>r.jenjang) as string[];
    const agamaDB   = d.map(r=>r.agama) as string[];
    const targetDB  = d.map(r=>r.target_menikah) as string[];
    const kepribDB  = d.map(r=>r.kepribadian) as string[];
    const mbtiDB    = d.map(r=>r.mbti) as string[];
    const profesiDB = d.map(r=>r.profesi) as string[];

    return NextResponse.json({
      success:        true,
      kota:           UNIQ([...kotaDB,    ...KOTA_STATIS]),
      universitas:    UNIQ([...univDB,    ...UNIV_STATIS]),
      program_studi:  UNIQ([...prodiDB,   ...PRODI_STATIS]),
      jenjang:        UNIQ([...jenjangDB, ...JENJANG_STATIS]),
      agama:          UNIQ([...agamaDB,   ...AGAMA_STATIS]),
      target_menikah: UNIQ([...targetDB,  ...TARGET_STATIS]),
      kepribadian:    UNIQ([...kepribDB,  ...KEPRIBADIAN_STATIS]),
      mbti:           UNIQ([...mbtiDB,    ...MBTI_STATIS]),
      profesi:        UNIQ(profesiDB), // profesi tetap dari DB saja (terlalu beragam)
    });

  } catch(err) {
    console.error('get-filter-options error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}