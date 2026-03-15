import matplotlib.pyplot as plt
import numpy as np
import os

def generate_final_radar_chart(stats):
    """
    stats: [Gerginlik, Özgüven, Coşku, Sert Ton] (Sadece bu 4 temel metrik)
    """
    os.makedirs("results", exist_ok=True)
    
    # Etiketler (Akıcılık çıkarıldı)
    labels = ['Gerginlik', 'Özgüven', 'Coşku', 'Sert Ton']
    num_vars = len(labels)
    
    # Veriyi kapatmak için ilk değeri sona ekle
    stats = np.array(stats)
    stats = np.concatenate((stats, [stats[0]]))
    
    # Açıları hesapla (4 eksen için 90 derecelik açılar oluşur)
    angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
    angles += angles[:1]

    # Grafik Ayarları: Tam Beyaz Arka Plan
    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor('white') 
    ax.set_facecolor('white')        

    # 1. Izgara (Grid) ve Yüzdelik Dilimler
    # Yazıları koyu lacivert/siyah yaparak belirginleştirdik
    grid_values = [20, 40, 60, 80, 100]
    ax.set_rgrids(grid_values, labels=[f"%{x}" for x in grid_values], 
                  color="#2c3e50", size=10, fontweight='bold')
    ax.set_ylim(0, 100)

    # 2. Ana Veri Çizgisi ve Noktalar (Koyu Lacivert)
    # Renk: #000080 (Navy Blue)
    ax.plot(angles, stats, color='#000080', linewidth=2.5, marker='o', markersize=8)
    ax.fill(angles, stats, color='#000080', alpha=0.1) # İç dolgu çok hafif

    # 3. Kategori Başlıkları (Tam Siyah)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=13, fontweight='bold', color='black')

    # 4. Değer Etiketleri (Noktaların tam üzerine % değerini yazma)
    for angle, value in zip(angles[:-1], stats[:-1]):
        ax.text(angle, value + 7, f"%{value:.1f}", 
                ha='center', va='center', fontsize=11, 
                fontweight='bold', color='#000080')

    # Başlık
    plt.title("Aday Duygu ve Özgüven Profili", size=15, pad=30, fontweight='bold', color='black')
    
    # Kaydetme
    file_path = "results/radar_chart_final.png"
    plt.savefig(file_path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✅ Rapor grafiği oluşturuldu: {file_path}")
