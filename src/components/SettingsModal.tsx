import React from 'react';
import type { AppSettings } from '../types/settings';
import type { TransitionType } from '../types/presentation';
import { Settings, X, Moon, Sun, Monitor, RefreshCw, FileType2 } from 'lucide-react';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  desktopAvailable: boolean;
  onCheckUpdates: () => void;
  onOpenPdfDefaults: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  desktopAvailable,
  onCheckUpdates,
  onOpenPdfDefaults,
  onClose,
}) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="title-with-icon">
            <Settings size={20} className="text-accent" />
            <h3>환경 설정</h3>
          </div>
          <button className="icon-btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body settings-grid">
          {/* Theme Settings */}
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">테마 모드 (Theme)</span>
              <span className="settings-desc">UI 색상 스타일을 선택합니다</span>
            </div>
            <div className="theme-toggle-group">
              <button
                className={`theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ theme: 'dark' })}
              >
                <Moon size={16} />
                <span>Dark</span>
              </button>
              <button
                className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ theme: 'light' })}
              >
                <Sun size={16} />
                <span>Light</span>
              </button>
              <button
                className={`theme-btn ${settings.theme === 'system' ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ theme: 'system' })}
              >
                <Monitor size={16} />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Transition Setting */}
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">기본 슬라이드 전환 효과</span>
              <span className="settings-desc">슬라이드 변경 시 적용될 애니메이션</span>
            </div>
            <select
              className="fluent-select"
              value={settings.defaultTransition}
              onChange={(e) =>
                onUpdateSettings({ defaultTransition: e.target.value as TransitionType })
              }
            >
              <option value="none">효과 없음 (None)</option>
              <option value="fade">페이드 (Fade)</option>
              <option value="slide-left">슬라이드 왼쪽 (Slide Left)</option>
              <option value="slide-right">슬라이드 오른쪽 (Slide Right)</option>
              <option value="slide-up">슬라이드 위로 (Slide Up)</option>
              <option value="slide-down">슬라이드 아래로 (Slide Down)</option>
              <option value="zoom">줌 (Zoom)</option>
              <option value="dissolve">디졸브 (Dissolve)</option>
              <option value="chalkboard">칠판 지우개 (Chalkboard Wipe)</option>
            </select>
          </div>

          {/* Transition Duration */}
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">전환 시간 (Duration)</span>
              <span className="settings-desc">{settings.transitionDurationMs}ms</span>
            </div>
            <input
              type="range"
              min={150}
              max={1200}
              step={50}
              value={settings.transitionDurationMs}
              onChange={(e) =>
                onUpdateSettings({ transitionDurationMs: Number(e.target.value) })
              }
              className="fluent-slider"
            />
          </div>

          {/* Laser Pointer Color */}
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">레이저 포인터 색상</span>
              <span className="settings-desc">발표 포인터 조명 색상</span>
            </div>
            <div className="laser-radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="laserColor"
                  checked={settings.laserColor === '#ef4444'}
                  onChange={() => onUpdateSettings({ laserColor: '#ef4444' })}
                />
                <span className="laser-dot-badge red"></span>
                <span>레드 (Red)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="laserColor"
                  checked={settings.laserColor === '#22c55e'}
                  onChange={() => onUpdateSettings({ laserColor: '#22c55e' })}
                />
                <span className="laser-dot-badge green"></span>
                <span>그린 (Green)</span>
              </label>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">펜 압력 감지</span>
              <span className="settings-desc">스타일러스 압력에 따라 선 굵기를 조절합니다</span>
            </div>
            <input
              type="checkbox"
              checked={settings.enableStylusPressure}
              onChange={(e) => onUpdateSettings({ enableStylusPressure: e.target.checked })}
            />
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">레이저 잔상</span>
              <span className="settings-desc">포인터 이동 궤적을 부드럽게 표시합니다</span>
            </div>
            <input
              type="checkbox"
              checked={settings.laserTrailEnabled}
              onChange={(e) => onUpdateSettings({ laserTrailEnabled: e.target.checked })}
            />
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">자동 재생 간격</span>
              <span className="settings-desc">{settings.autoPlayIntervalSeconds}초마다 다음 슬라이드로 이동</span>
            </div>
            <input
              type="range"
              min={2}
              max={60}
              value={settings.autoPlayIntervalSeconds}
              onChange={(e) => onUpdateSettings({ autoPlayIntervalSeconds: Number(e.target.value) })}
              className="fluent-slider"
            />
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">자동 재생 반복</span>
              <span className="settings-desc">마지막 슬라이드 뒤 첫 슬라이드로 돌아갑니다</span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoPlayLoop}
              onChange={(e) => onUpdateSettings({ autoPlayLoop: e.target.checked })}
            />
          </div>

          <div className="settings-row settings-about-row">
            <div className="settings-label-group" style={{ width: '100%' }}>
              <span className="settings-label">CrowShow v1.0 · Crow Science Lab</span>
              <span className="settings-desc">
                오프라인 PDF 수업을 위한 프레젠테이션 플레이어
              </span>
              <details style={{ marginTop: '10px', lineHeight: 1.7 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>빠른 사용 방법</summary>
                <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                  PDF를 열고 좌우 버튼 또는 마우스 휠로 페이지를 이동합니다. V는 선택,
                  P는 펜, H는 형광펜, T는 텍스트, L은 레이저, S는 스포트라이트이며
                  F5로 전체화면 발표를 시작합니다. 중요한 필기와 설정은 .crowshow 파일로
                  내보내 보관하십시오.
                </div>
              </details>
              <span className="settings-desc" style={{ marginTop: '8px' }}>
                Windows 설치판에는 공식 GitHub 업데이트 확인과 사용자 선택형 PDF 기본 앱
                연결 안내가 제공됩니다.
              </span>
              {desktopAvailable && (
                <div className="project-btn-group" style={{ marginTop: '10px' }}>
                  <button className="btn-secondary" onClick={onCheckUpdates}>
                    <RefreshCw size={16} />
                    <span>업데이트 확인</span>
                  </button>
                  <button className="btn-secondary" onClick={onOpenPdfDefaults}>
                    <FileType2 size={16} />
                    <span>PDF 기본 앱 설정</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>
  );
};
