import React, { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Maximize2 } from 'lucide-react';
import { PdfLoader } from '../pdf/pdfLoader';
import { AnnotationStore } from '../annotations/annotationStore';
import { TransitionContainer } from '../transitions/transitionContainer';
import type { TransitionType } from '../types/presentation';
import type { SlideAnnotationMap } from '../types/annotation';

interface AudienceMessage {
  source: 'crowshow-presenter';
  type: 'initialize' | 'navigate';
  bytes?: Uint8Array;
  fileName?: string;
  currentSlide: number;
  transitionType?: TransitionType;
  annotations?: SlideAnnotationMap;
}

export const AudienceWindowView: React.FC = () => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [aspectRatios, setAspectRatios] = useState<number[]>([]);
  const [transitionType, setTransitionType] = useState<TransitionType>('fade');
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    const onMessage = async (event: MessageEvent<AudienceMessage>) => {
      const message = event.data;
      if (!message || message.source !== 'crowshow-presenter') return;
      if (message.type === 'initialize' && message.bytes && message.fileName) {
        const loader = PdfLoader.getInstance();
        const info = await loader.loadFromBuffer(message.bytes, message.fileName, message.bytes.byteLength);
        AnnotationStore.getInstance().setDocument(info.id);
        setPdfDoc(loader.getPdfDocument());
        setAspectRatios(info.pageAspectRatios);
      }
      if (message.annotations) AnnotationStore.getInstance().setAllAnnotations(message.annotations);
      setCurrentSlide(message.currentSlide);
      if (message.transitionType) setTransitionType(message.transitionType);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('message', onMessage);
    window.opener?.postMessage({ source: 'crowshow-audience', type: 'ready' }, window.location.origin);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <div className="audience-window">
      {pdfDoc ? (
        <TransitionContainer
          pdfDoc={pdfDoc}
          currentSlide={currentSlide}
          slideAspect={aspectRatios[currentSlide - 1] || 16 / 9}
          containerWidth={size.width}
          containerHeight={size.height}
          zoomFactor={1}
          activeTool="select"
          penColor="#ef4444"
          penWidth={4}
          highlighterColor="#facc15"
          highlighterWidth={20}
          laserColor="#ef4444"
          spotlightRadius={180}
          screenCurtain="none"
          transitionConfig={{ type: transitionType, durationMs: 600, easing: 'ease' }}
          readOnly
        />
      ) : (
        <div className="audience-waiting">발표자 화면에 연결하는 중…</div>
      )}
      <button
        className="audience-fullscreen-button"
        onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
        title="이 화면을 전체화면으로 전환"
      >
        <Maximize2 size={18} />
      </button>
    </div>
  );
};
