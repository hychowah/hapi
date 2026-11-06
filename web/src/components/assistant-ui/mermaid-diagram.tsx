import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown'
import {
    useEffect,
    useId,
    useRef,
    useState,
    type ComponentPropsWithoutRef,
    type SyntheticEvent,
} from 'react'
import { ZoomableLightbox } from '@/components/ZoomableLightbox'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

let initializedTheme: 'light' | 'dark' | null = null
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function getMermaid() {
    if (!mermaidPromise) {
        mermaidPromise = import('mermaid').then((module) => module.default)
    }
    return mermaidPromise
}

function resolveTheme() {
    if (typeof document === 'undefined') return 'light' as const
    const theme = document.documentElement.dataset.theme
    return theme === 'dark' || theme === 'oled' ? 'dark' as const : 'light' as const
}

async function ensureMermaid(theme: 'light' | 'dark') {
    const mermaid = await getMermaid()
    if (initializedTheme === theme) return mermaid

    mermaid.setParseErrorHandler(() => undefined)

    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: theme === 'dark' ? 'dark' : 'default',
        themeVariables: theme === 'dark'
            ? {
                primaryColor: '#323843',
                primaryTextColor: '#edf1f5',
                primaryBorderColor: '#6d8fd6',
                lineColor: '#94a3b8',
                tertiaryColor: '#2d3440',
                background: '#2a2f35',
                mainBkg: '#323843',
                secondBkg: '#2d3440',
                tertiaryBkg: '#29313b',
                clusterBkg: '#2d3440',
                clusterBorder: '#6d8fd6',
                edgeLabelBackground: '#2a2f35',
                actorBkg: '#323843',
                actorBorder: '#6d8fd6',
                actorTextColor: '#edf1f5',
                signalColor: '#94a3b8',
                labelBoxBkgColor: '#323843',
                labelTextColor: '#edf1f5',
                loopTextColor: '#edf1f5',
                noteBkgColor: '#2d3440',
                noteTextColor: '#edf1f5',
            }
            : {
                primaryColor: '#f8fbff',
                primaryTextColor: '#2d333b',
                primaryBorderColor: '#b8cdfd',
                lineColor: '#94a3b8',
                tertiaryColor: '#eef4ff',
                background: '#f5f6f7',
                mainBkg: '#f8fbff',
                secondBkg: '#eef4ff',
                tertiaryBkg: '#edf3fb',
                clusterBkg: '#eef4ff',
                clusterBorder: '#b8cdfd',
                edgeLabelBackground: '#f5f6f7',
                actorBkg: '#f8fbff',
                actorBorder: '#b8cdfd',
                actorTextColor: '#2d333b',
                signalColor: '#94a3b8',
                labelBoxBkgColor: '#f8fbff',
                labelTextColor: '#2d333b',
                loopTextColor: '#2d333b',
                noteBkgColor: '#eef4ff',
                noteTextColor: '#2d333b',
            },
    })

    initializedTheme = theme
    return mermaid
}

/**
 * Result of attempting to render a Mermaid block. On failure `error` carries a
 * human-readable reason so the UI can surface *why* the diagram fell back to
 * source instead of swallowing it (see #1117). `error` is null only on success.
 */
export type MermaidRenderOutcome =
    | { svg: string; error: null }
    | { svg: null; error: string }

function toMermaidErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === 'string' && err.trim()) return err.trim()
    return 'Mermaid could not render this diagram.'
}

export async function renderMermaidSvg(
    code: string,
    elementId: string,
    theme: 'light' | 'dark',
): Promise<MermaidRenderOutcome> {
    const mermaid = await ensureMermaid(theme)

    // Primary validation gate (unchanged from #785/#813): parse with
    // suppressErrors so Mermaid never injects its own error SVG or fires global
    // parse-error side effects. A falsy result means invalid syntax.
    const isValid = await mermaid.parse(code, { suppressErrors: true })
    if (!isValid) {
        // Re-parse WITHOUT suppression purely to capture the reason. The
        // parse-error handler is a no-op and suppressErrorRendering is on, so
        // this has no rendering/side-effect cost - it just lets the thrown
        // error surface its message for diagnostics.
        try {
            await mermaid.parse(code)
        } catch (err) {
            return { svg: null, error: toMermaidErrorMessage(err) }
        }
        return { svg: null, error: 'Mermaid rejected this diagram but gave no reason.' }
    }

    try {
        const result = await mermaid.render(elementId, code)
        return { svg: result.svg, error: null }
    } catch (err) {
        return { svg: null, error: toMermaidErrorMessage(err) }
    }
}

export function getMermaidSvgLayoutSize(svg: string): { width: number; height: number } | null {
    const viewBoxMatch = svg.match(/\bviewBox=(['"])([^'"]+)\1/i)
    if (!viewBoxMatch) return null
    const parts = viewBoxMatch[2].trim().split(/[\s,]+/).map(Number)
    if (parts.length < 4 || parts.some(Number.isNaN) || parts[2] <= 0 || parts[3] <= 0) return null
    return { width: parts[2], height: parts[3] }
}

/** Mermaid often emits width="100%"; normalize before rasterizing for the lightbox. */
export function normalizeMermaidSvgForStandaloneDisplay(svg: string): string {
    const viewBoxSize = getMermaidSvgLayoutSize(svg)
    if (!viewBoxSize) return svg

    const { width, height } = viewBoxSize
    return svg.replace(/<svg\b[^>]*>/i, (rootTag) => {
        // A repeated width/height is tolerated in HTML but invalid in an SVG image.
        let result = rootTag.replace(/\s(?:width|height)=(["'])[^"']*\1/gi, '')

        const stylePattern = /\sstyle=(["'])(.*?)\1/i
        const styleMatch = result.match(stylePattern)
        const quote = styleMatch?.[1] ?? '"'
        const cleaned = (styleMatch?.[2] ?? '')
            .replace(/(?:^|;)\s*max-width:\s*[^;]+/gi, '')
            .replace(/(?:^|;)\s*width:\s*[^;]+/gi, '')
            .replace(/(?:^|;)\s*height:\s*[^;]+/gi, '')
            .replace(/^;+|;+$/g, '')
            .replace(/;\s*;/g, ';')
            .trim()
        const style = `${cleaned ? `${cleaned};` : ''}width:${width}px;height:${height}px`
        result = result.replace(stylePattern, '')
        return result.replace(/<svg\b/i, `<svg width="${width}" height="${height}" style=${quote}${style}${quote}`)
    })
}

function MermaidFallback(
    props: ComponentPropsWithoutRef<'div'> & { code: string; error?: string | null },
) {
    const { code, error, className, ...rest } = props
    const { t } = useTranslation()
    return (
        <div
            {...rest}
            data-mermaid-error={error ?? undefined}
            className={cn('aui-mermaid-fallback-wrapper overflow-hidden rounded-b-xl bg-[var(--app-code-bg)]', className)}
        >
            {/*
              Only show the failure notice on an actual failure. During the brief
              async load window the component also renders this fallback (svg not
              ready yet) with error=null - suppressing the notice there avoids a
              "Could not render" flash before the diagram appears.
            */}
            {error ? (
                <div className="aui-mermaid-fallback-notice flex flex-col gap-1 border-b border-[var(--app-divider)] px-4 py-2 text-xs text-[var(--app-hint)]">
                    <span className="font-medium text-[var(--app-fg)]">{t('mermaid.renderError')}</span>
                    <span className="aui-mermaid-fallback-reason overflow-x-auto whitespace-pre-wrap break-words font-mono text-[var(--app-hint)]">
                        {error}
                    </span>
                </div>
            ) : null}
            <pre className="aui-mermaid-fallback m-0 overflow-x-auto p-4 text-sm text-[var(--app-fg)]">
                <code>{code}</code>
            </pre>
        </div>
    )
}

function MermaidSvgContent(props: { svg: string; className?: string }) {
    return (
        <div
            className={cn('w-full', props.className)}
        >
            <img
                src={mermaidImageSource(props.svg)}
                alt="Diagram"
                draggable={false}
                className="mx-auto h-auto max-w-full pointer-events-none"
                style={{ maxWidth: 'min(100%, 48rem)' }}
            />
        </div>
    )
}

// SVG image documents cannot execute scripts or style the surrounding approval UI.
function mermaidImageSource(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalizeMermaidSvgForStandaloneDisplay(svg))}`
}

/**
 * Use the same inert image boundary in the viewer as in the inline diagram.
 * Explicit viewBox dimensions preserve the lightbox's zoom/fit measurements.
 */
function MermaidLightboxSvg(props: { svg: string }) {
    const hostRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
        const image = document.createElement('img')
        image.src = mermaidImageSource(props.svg)
        image.alt = 'Diagram'
        image.draggable = false
        image.style.cssText = 'display:block;max-width:none;max-height:none'
        host.style.cssText = 'display:inline-block;line-height:0'
        root.replaceChildren(image)
    }, [props.svg])

    return <div ref={hostRef} className="aui-mermaid-lightbox-host" data-mermaid-lightbox />
}

function readMermaidE2eCaseId(code: string): string | undefined {
    return code.match(/<!--\s*mermaid-e2e:([\w-]+)\s*-->/i)?.[1]
}

export function MermaidDiagram(props: SyntaxHighlighterProps) {
    const { t } = useTranslation()
    const e2eCaseId = readMermaidE2eCaseId(props.code)
    const [theme, setTheme] = useState<'light' | 'dark'>(() => resolveTheme())
    const [renderError, setRenderError] = useState(false)
    const [errorReason, setErrorReason] = useState<string | null>(null)
    const [svg, setSvg] = useState<string | null>(null)
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const id = useId().replace(/:/g, '-')
    const openLabel = t('mermaid.openFullscreen')
    const viewerLabel = t('mermaid.viewerTitle')

    const stopEvent = (event: SyntheticEvent) => {
        event.stopPropagation()
    }

    const openLightbox = (event: SyntheticEvent) => {
        event.preventDefault()
        event.stopPropagation()
        if (!svg) return
        setLightboxOpen(true)
    }

    useEffect(() => {
        if (typeof document === 'undefined') return undefined

        const root = document.documentElement
        const observer = new MutationObserver(() => {
            setTheme(resolveTheme())
        })

        observer.observe(root, {
            attributes: true,
            attributeFilter: ['data-theme'],
        })

        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        let cancelled = false

        const render = async () => {
            try {
                const outcome = await renderMermaidSvg(props.code, `mermaid-${id}`, theme)
                if (cancelled) return
                if (!outcome.svg) {
                    setSvg(null)
                    setRenderError(true)
                    setErrorReason(outcome.error)
                    return
                }
                setSvg(outcome.svg)
                setRenderError(false)
                setErrorReason(null)
            } catch (err) {
                if (cancelled) return
                setSvg(null)
                setRenderError(true)
                setErrorReason(toMermaidErrorMessage(err))
            }
        }

        void render()

        return () => {
            cancelled = true
        }
    }, [id, props.code, theme])

    const lightboxLayoutSize = svg ? getMermaidSvgLayoutSize(svg) : null

    if (renderError || !svg) {
        return (
            <MermaidFallback
                code={props.code}
                error={errorReason}
                data-mermaid-diagram
                data-rendered="false"
            />
        )
    }

    return (
        <>
            <button
                type="button"
                aria-label={openLabel}
                title={openLabel}
                onPointerDown={stopEvent}
                onMouseDown={stopEvent}
                onTouchStart={stopEvent}
                onClick={openLightbox}
                className="aui-mermaid-diagram w-full cursor-zoom-in overflow-x-auto rounded-b-xl bg-[var(--app-code-bg)] px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                data-mermaid-diagram
                data-rendered="true"
                data-mermaid-e2e-case={e2eCaseId}
                data-mermaid-source={encodeURIComponent(props.code)}
            >
                <MermaidSvgContent svg={svg} />
            </button>

            <ZoomableLightbox
                open={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                title={viewerLabel}
                ariaLabel={viewerLabel}
                fitContentKey={lightboxOpen ? svg : null}
                fitContentSize={lightboxLayoutSize}
            >
                <div className="rounded-lg bg-[var(--app-code-bg)] px-3 py-3">
                    <MermaidLightboxSvg svg={svg} />
                </div>
            </ZoomableLightbox>
        </>
    )
}
