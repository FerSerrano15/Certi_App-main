import { Injectable } from '@angular/core';
import { FaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';

// Versión fijada al mismo release instalado en package.json — evita
// sorpresas si @mediapipe/tasks-vision publica una versión más nueva del
// runtime WASM que ya no sea compatible con esta API.
const TASKS_VISION_VERSION = '1.0.1';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export interface FaceCheckMetric {
  ok: boolean;
  label: string;
  detail: string;
}

export interface FaceCheckResult {
  rostro: {
    detectado: boolean;
    cantidad: number;
  };
  metrics: {
    pose: FaceCheckMetric;
    tamano: FaceCheckMetric;
    posicion: FaceCheckMetric;
    oclusion: FaceCheckMetric;
    visibilidad: FaceCheckMetric;
  };
  resultado: {
    apta: boolean;
    motivo: string;
  };
}

/**
 * Analiza fotos de perfil en el propio navegador (nada sale del dispositivo
 * del usuario) usando MediaPipe Tasks Vision (FaceDetector, modelo
 * "BlazeFace short-range"), para evitar que se suban imágenes que
 * claramente no son una foto de rostro (capturas de videojuegos, memes,
 * paisajes, logos, etc.) y detectar problemas obvios de encuadre.
 *
 * Importante: esto es una verificación HEURÍSTICA y aproximada — no es un
 * sistema de verificación de identidad ni sustituye la revisión humana.
 * Por eso, además de este chequeo automático, cada foto/documento subido
 * por un candidato le llega al admin como aviso para que confirme su
 * veracidad (ver NotificationsService en el backend).
 */
@Injectable({ providedIn: 'root' })
export class FaceAnalysisService {
  private detectorPromise: Promise<FaceDetector> | null = null;

  private async getDetector(): Promise<FaceDetector> {
    if (!this.detectorPromise) {
      this.detectorPromise = (async () => {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        return FaceDetector.createFromOptions(fileset, {
          // CPU en vez de GPU: es un análisis puntual (una foto a la vez, no
          // video en tiempo real), y CPU evita problemas de compatibilidad
          // con WebGL en equipos/navegadores más restringidos.
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        });
      })().catch((err) => {
        // Si falla la carga (sin internet, CDN bloqueado, etc.), no dejamos
        // la promesa "envenenada" — permitimos reintentar en el siguiente
        // análisis en vez de fallar para siempre en esta sesión de la app.
        this.detectorPromise = null;
        throw err;
      });
    }
    return this.detectorPromise;
  }

  async analyzeFile(file: File): Promise<FaceCheckResult> {
    const img = await this.loadImage(file);
    try {
      return await this.analyzeImage(img);
    } finally {
      URL.revokeObjectURL(img.src);
    }
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = URL.createObjectURL(file);
    });
  }

  private async analyzeImage(img: HTMLImageElement): Promise<FaceCheckResult> {
    const detector = await this.getDetector();
    const { detections } = detector.detect(img);
    return this.buildResult(detections, img.naturalWidth, img.naturalHeight);
  }

  private buildResult(detections: Detection[], width: number, height: number): FaceCheckResult {
    const cantidad = detections.length;

    if (cantidad !== 1) {
      const motivo = cantidad === 0
        ? 'No se detectó ningún rostro en la imagen. Sube una foto donde se vea tu cara claramente.'
        : `Se detectaron ${cantidad} rostros. La foto debe mostrar únicamente tu rostro, sin otras personas de fondo.`;
      const failedMetric: FaceCheckMetric = { ok: false, label: '—', detail: 'No evaluado: no hay exactamente un rostro.' };
      return {
        rostro: { detectado: cantidad > 0, cantidad },
        metrics: {
          pose: failedMetric, tamano: failedMetric, posicion: failedMetric,
          oclusion: failedMetric, visibilidad: failedMetric,
        },
        resultado: { apta: false, motivo },
      };
    }

    const det = detections[0];
    const box = det.boundingBox;
    const score = det.categories?.[0]?.score ?? 0;
    const kp = det.keypoints ?? [];
    // Orden estándar de BlazeFace: ojo derecho, ojo izquierdo, punta de
    // nariz, centro de boca, tragión oreja derecha, tragión oreja izquierda.
    const [rightEye, leftEye, noseTip] = kp;

    // ── Tamaño del rostro ────────────────────────────────────────────────
    const faceHeightRatio = box ? box.height / height : 0;
    const tamanoOk = box != null && faceHeightRatio >= 0.15 && faceHeightRatio <= 0.95;
    const tamano: FaceCheckMetric = {
      ok: tamanoOk,
      label: tamanoOk ? 'Tamaño adecuado' : (faceHeightRatio < 0.15 ? 'El rostro se ve muy pequeño/lejano' : 'El rostro ocupa casi toda la imagen'),
      detail: `El rostro ocupa aproximadamente ${(faceHeightRatio * 100).toFixed(0)}% de la altura de la foto.`,
    };

    // ── Posición del rostro (centrado) ──────────────────────────────────
    let posicionOk = false;
    let offX = 0, offY = 0;
    if (box) {
      const centerX = (box.originX + box.width / 2) / width;
      const centerY = (box.originY + box.height / 2) / height;
      offX = Math.abs(centerX - 0.5);
      offY = Math.abs(centerY - 0.5);
      posicionOk = offX <= 0.30 && offY <= 0.30;
    }
    const posicion: FaceCheckMetric = {
      ok: posicionOk,
      label: posicionOk ? 'Rostro centrado' : 'El rostro no está centrado',
      detail: posicionOk
        ? 'El rostro está razonablemente centrado en la imagen.'
        : 'Centra tu rostro en el encuadre antes de tomar/subir la foto.',
    };

    // ── Oclusión aproximada (rostro cortado por el borde, o baja confianza) ─
    let bordeCortado = false;
    if (box) {
      const margin = 2; // px de tolerancia
      bordeCortado = box.originX <= margin || box.originY <= margin
        || box.originX + box.width >= width - margin
        || box.originY + box.height >= height - margin;
    }
    const oclusionOk = !bordeCortado && score >= 0.6;
    const oclusion: FaceCheckMetric = {
      ok: oclusionOk,
      label: oclusionOk ? 'Sin oclusiones aparentes' : 'Posible oclusión u obstrucción del rostro',
      detail: bordeCortado
        ? 'Parte del rostro parece estar cortada por el borde de la imagen.'
        : (oclusionOk ? 'No se detectaron señales evidentes de obstrucción.' : 'Algo podría estar cubriendo parte del rostro (lentes oscuros, cubrebocas, mano, sombra fuerte, etc.).'),
    };

    // ── Visibilidad (confianza de detección del modelo) ─────────────────
    const visibilidadOk = score >= 0.5;
    const visibilidad: FaceCheckMetric = {
      ok: visibilidadOk,
      label: visibilidadOk ? 'Rostro claramente visible' : 'Rostro poco visible/nítido',
      detail: `Confianza de detección: ${(score * 100).toFixed(0)}%.`,
    };

    // ── Pose de la cabeza (aproximada a partir de los puntos clave) ─────
    let poseOk = true;
    let poseDetail = 'No fue posible estimar la pose con precisión, pero no se detectaron señales de mala orientación.';
    if (rightEye && leftEye && noseTip) {
      const rollDeg = Math.abs(
        (Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x) * 180) / Math.PI,
      );
      const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y) || 1e-6;
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const yawRatio = Math.abs(noseTip.x - eyeMidX) / eyeDist;

      const rollOk = rollDeg <= 20;
      const yawOk = yawRatio <= 0.45;
      poseOk = rollOk && yawOk;
      poseDetail = poseOk
        ? 'La cabeza está razonablemente derecha y de frente.'
        : !rollOk
          ? 'La cabeza está inclinada. Mantén la cabeza recta y mira de frente a la cámara.'
          : 'El rostro está girado. Mira de frente a la cámara, no de perfil.';
    }
    const pose: FaceCheckMetric = {
      ok: poseOk,
      label: poseOk ? 'Pose frontal' : 'Pose no frontal',
      detail: poseDetail,
    };

    const metrics = { pose, tamano, posicion, oclusion, visibilidad };
    const apta = Object.values(metrics).every((m) => m.ok);
    const motivo = apta
      ? 'La fotografía muestra un único rostro frontal, visible y bien encuadrado.'
      : 'Revisa los puntos marcados abajo y vuelve a intentarlo con otra foto.';

    return {
      rostro: { detectado: true, cantidad: 1 },
      metrics,
      resultado: { apta, motivo },
    };
  }
}
