import { nanoid } from 'nanoid'

import type {
  BriefingSlide,
  ScenarioBriefing,
  ScenarioDocument,
} from '@/features/scenario/model'

function cloneSlideViewState(document: ScenarioDocument) {
  return {
    viewport: structuredClone(document.viewport),
    basemapPreset: document.basemap.preset,
    sceneSelection: structuredClone(document.scene),
  } satisfies Pick<BriefingSlide, 'viewport' | 'basemapPreset' | 'sceneSelection'>
}

function ensureBriefing(document: ScenarioDocument): ScenarioBriefing {
  return document.briefing
    ? structuredClone(document.briefing)
    : {
        slides: [],
        activeSlideId: null,
      }
}

function withBriefing(document: ScenarioDocument, briefing: ScenarioBriefing | undefined): ScenarioDocument {
  return briefing
    ? {
        ...document,
        briefing,
      }
    : {
        ...document,
        briefing: undefined,
      }
}

function withAppliedSlideState(document: ScenarioDocument, slide: BriefingSlide | null): ScenarioDocument {
  if (!slide) {
    return document
  }

  return {
    ...document,
    viewport: structuredClone(slide.viewport),
    basemap: {
      ...document.basemap,
      preset: slide.basemapPreset,
    },
    scene: structuredClone(slide.sceneSelection),
  }
}

function getNextSlideTitle(briefing: ScenarioBriefing) {
  return `Slayt ${briefing.slides.length + 1}`
}

export function getBriefingSlides(document: ScenarioDocument) {
  return document.briefing?.slides ?? []
}

export function getActiveBriefingSlide(document: ScenarioDocument): BriefingSlide | null {
  if (!document.briefing?.activeSlideId) {
    return null
  }

  return document.briefing.slides.find((slide) => slide.id === document.briefing?.activeSlideId) ?? null
}

export function getVisibleElementIdsForSlide(document: ScenarioDocument, slideId: string | null) {
  if (!slideId) {
    return null
  }

  const slide = document.briefing?.slides.find((item) => item.id === slideId)
  return slide ? [...slide.visibleElementIds] : null
}

export function getVisibleElementIdsForActiveSlide(document: ScenarioDocument) {
  return getVisibleElementIdsForSlide(document, document.briefing?.activeSlideId ?? null)
}

export function isElementVisibleOnSlide(
  document: ScenarioDocument,
  slideId: string | null,
  elementId: string,
) {
  const visibleElementIds = getVisibleElementIdsForSlide(document, slideId)
  return visibleElementIds ? visibleElementIds.includes(elementId) : true
}

export function createSlideFromCurrentView(document: ScenarioDocument): ScenarioDocument {
  const briefing = ensureBriefing(document)
  const slide: BriefingSlide = {
    id: nanoid(10),
    title: getNextSlideTitle(briefing),
    notes: '',
    ...cloneSlideViewState(document),
    visibleElementIds: document.elements.map((element) => element.id),
  }

  return withBriefing(document, {
    slides: [...briefing.slides, slide],
    activeSlideId: slide.id,
  })
}

export function duplicateSlide(document: ScenarioDocument, slideId: string): ScenarioDocument {
  const briefing = document.briefing
  if (!briefing) {
    return document
  }

  const slideIndex = briefing.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex < 0) {
    return document
  }

  const source = briefing.slides[slideIndex]
  const duplicate: BriefingSlide = {
    ...structuredClone(source),
    id: nanoid(10),
    title: `${source.title} (Kopya)`,
  }
  const slides = [...briefing.slides]
  slides.splice(slideIndex + 1, 0, duplicate)

  return withBriefing(document, {
    slides,
    activeSlideId: duplicate.id,
  })
}

export function deleteSlide(document: ScenarioDocument, slideId: string): ScenarioDocument {
  const briefing = document.briefing
  if (!briefing) {
    return document
  }

  const slideIndex = briefing.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex < 0) {
    return document
  }

  const slides = briefing.slides.filter((slide) => slide.id !== slideId)
  const nextActiveSlideId =
    briefing.activeSlideId !== slideId
      ? briefing.activeSlideId
      : slides[slideIndex]?.id ?? slides[slideIndex - 1]?.id ?? null
  const nextBriefing: ScenarioBriefing = {
    slides,
    activeSlideId: nextActiveSlideId,
  }

  return withAppliedSlideState(withBriefing(document, nextBriefing), slides.find((slide) => slide.id === nextActiveSlideId) ?? null)
}

function moveSlide(document: ScenarioDocument, slideId: string, offset: -1 | 1) {
  const briefing = document.briefing
  if (!briefing) {
    return document
  }

  const currentIndex = briefing.slides.findIndex((slide) => slide.id === slideId)
  const nextIndex = currentIndex + offset
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= briefing.slides.length) {
    return document
  }

  const slides = [...briefing.slides]
  const [slide] = slides.splice(currentIndex, 1)
  slides.splice(nextIndex, 0, slide)

  return withBriefing(document, {
    ...briefing,
    slides,
  })
}

export function moveSlideUp(document: ScenarioDocument, slideId: string) {
  return moveSlide(document, slideId, -1)
}

export function moveSlideDown(document: ScenarioDocument, slideId: string) {
  return moveSlide(document, slideId, 1)
}

export function setActiveSlide(document: ScenarioDocument, slideId: string | null): ScenarioDocument {
  if (!document.briefing) {
    return document
  }

  const slide = slideId
    ? document.briefing.slides.find((item) => item.id === slideId) ?? null
    : null

  return withAppliedSlideState(
    withBriefing(document, {
      ...document.briefing,
      activeSlideId: slide?.id ?? null,
    }),
    slide,
  )
}

export function renameSlide(document: ScenarioDocument, slideId: string, title: string): ScenarioDocument {
  if (!document.briefing) {
    return document
  }

  const nextTitle = title.trim() || 'Adsız slayt'

  return withBriefing(document, {
    ...document.briefing,
    slides: document.briefing.slides.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            title: nextTitle,
          }
        : slide,
    ),
  })
}

export function updateSlideNotes(document: ScenarioDocument, slideId: string, notes: string): ScenarioDocument {
  if (!document.briefing) {
    return document
  }

  return withBriefing(document, {
    ...document.briefing,
    slides: document.briefing.slides.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            notes,
          }
        : slide,
    ),
  })
}

export function setElementVisibilityOnSlide(
  document: ScenarioDocument,
  slideId: string,
  elementId: string,
  visible: boolean,
): ScenarioDocument {
  if (!document.briefing) {
    return document
  }

  return withBriefing(document, {
    ...document.briefing,
    slides: document.briefing.slides.map((slide) => {
      if (slide.id !== slideId) {
        return slide
      }

      const nextVisibleIds = visible
        ? slide.visibleElementIds.includes(elementId)
          ? slide.visibleElementIds
          : [...slide.visibleElementIds, elementId]
        : slide.visibleElementIds.filter((id) => id !== elementId)

      return {
        ...slide,
        visibleElementIds: nextVisibleIds,
      }
    }),
  })
}

export function syncActiveSlideViewState(document: ScenarioDocument): ScenarioDocument {
  const activeSlide = getActiveBriefingSlide(document)
  if (!document.briefing || !activeSlide) {
    return document
  }

  return withBriefing(document, {
    ...document.briefing,
    slides: document.briefing.slides.map((slide) =>
      slide.id === activeSlide.id
        ? {
            ...slide,
            ...cloneSlideViewState(document),
          }
        : slide,
    ),
  })
}

export function addElementToActiveSlide(document: ScenarioDocument, elementId: string): ScenarioDocument {
  const activeSlide = getActiveBriefingSlide(document)
  if (!document.briefing || !activeSlide) {
    return document
  }

  return setElementVisibilityOnSlide(document, activeSlide.id, elementId, true)
}

export function removeElementIdsFromSlides(document: ScenarioDocument, elementIds: string[]): ScenarioDocument {
  if (!document.briefing || elementIds.length === 0) {
    return document
  }

  const blockedIds = new Set(elementIds)

  return withBriefing(document, {
    ...document.briefing,
    slides: document.briefing.slides.map((slide) => ({
      ...slide,
      visibleElementIds: slide.visibleElementIds.filter((elementId) => !blockedIds.has(elementId)),
    })),
  })
}
