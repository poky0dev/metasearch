(() => {
	const solveCaptcha = async (a) => {
		const { solveCaptcha } = await import("/s/captcha.js");
		return solveCaptcha(a);
	};

	const safeUrl = (url) => {
		if (!url) return "#";
		try {
			const parsed = new URL(url);
			if (parsed.protocol === "http:" || parsed.protocol === "https:")
				return url;
		} catch {}
		return "#";
	};

	let allImages = [];
	let selectedIndex = -1;
	let detailPanel = null;
	let isLoading = false;
	let hasMoreResults = true;
	let pk = "__results_pk__";
	const currentQuery = new URLSearchParams(window.location.search).get("q");

	const createDetailPanel = (img) => {
		const width = img.properties?.width;
		const height = img.properties?.height;

		const panel = document.createElement("div");
		panel.className = "image-detail-panel";

		const header = document.createElement("div");
		header.className = "image-detail-header";

		const prevBtn = document.createElement("button");
		prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>`;
		prevBtn.title = "Previous";
		prevBtn.onclick = (e) => {
			e.stopPropagation();
			navigateImage(-1);
		};

		const nextBtn = document.createElement("button");
		nextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
		nextBtn.title = "Next";
		nextBtn.onclick = (e) => {
			e.stopPropagation();
			navigateImage(1);
		};

		const closeBtn = document.createElement("button");
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
		closeBtn.title = "Close";
		closeBtn.onclick = (e) => {
			e.stopPropagation();
			closeDetailPanel();
		};

		header.append(prevBtn, nextBtn, closeBtn);

		const content = document.createElement("div");
		content.className = "image-detail-content";

		const preview = document.createElement("a");
		preview.className = "image-detail-preview";
		preview.href = safeUrl(img.properties.url);
		preview.target = "_blank";
		preview.rel = "noopener";

		const previewImg = document.createElement("img");
		previewImg.src = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(img.properties.url)}`;
		previewImg.style.aspectRatio = `${width}/${height}`;
		previewImg.alt = img.title;
		preview.append(previewImg);

		const info = document.createElement("div");
		info.className = "image-detail-info";

		const titleEl = document.createElement("h2");
		titleEl.className = "image-detail-title";
		titleEl.textContent = img.title;

		const sourceEl = document.createElement("a");
		sourceEl.className = "image-detail-source";
		sourceEl.href = img.url;
		sourceEl.target = "_blank";
		sourceEl.rel = "noopener";
		sourceEl.textContent = (img.meta_url?.hostname || "").replace(/^www\./, "");

		const dimensionsEl = document.createElement("div");
		dimensionsEl.className = "image-detail-dimensions";
		if (width && height) {
			dimensionsEl.textContent = `${width} × ${height}`;
		}

		const actions = document.createElement("div");
		actions.className = "image-detail-actions";
		const viewLink = document.createElement("a");
		viewLink.href = safeUrl(img.properties.url);
		viewLink.target = "_blank";
		viewLink.rel = "noopener";
		viewLink.textContent = "View file";
		actions.append(viewLink);

		info.append(titleEl, sourceEl, dimensionsEl, actions);
		content.append(preview, info);
		panel.append(header, content);

		return panel;
	};

	const closeDetailPanel = () => {
		if (detailPanel) {
			detailPanel.remove();
			detailPanel = null;
		}
		const selected = document.querySelector(".image-item.selected");
		if (selected) selected.classList.remove("selected");
		selectedIndex = -1;
	};

	const showDetailPanel = (index) => {
		if (index < 0 || index >= allImages.length) return;

		closeDetailPanel();
		selectedIndex = index;

		const img = allImages[index];
		const grid = document.getElementById("images-grid");
		const items = grid.querySelectorAll(".image-item");
		const clickedItem = items[index];

		if (clickedItem) {
			clickedItem.classList.add("selected");
		}

		detailPanel = createDetailPanel(img, index);

		const clickedTop = clickedItem.offsetTop;

		let insertAfterItem = clickedItem;
		for (let i = index + 1; i < items.length; i++) {
			const itemTop = items[i].offsetTop;
			if (Math.abs(itemTop - clickedTop) < 10) {
				insertAfterItem = items[i];
			} else {
				break;
			}
		}

		insertAfterItem.after(detailPanel);

		setTimeout(() => {
			detailPanel.scrollIntoView({ behavior: "smooth", block: "center" });
		}, 50);
	};

	const navigateImage = (direction) => {
		const newIndex = selectedIndex + direction;
		if (newIndex >= 0 && newIndex < allImages.length) {
			showDetailPanel(newIndex);
		}
	};

	const renderImageResult = (img, index) => {
		const thumbUrl = img.thumbnail || img.properties?.url || "";
		const title = img.title || "";
		const hostname = img.meta_url?.hostname || "";
		const favicon = img.meta_url?.favicon || "";
		const sourceName = hostname.replace(/^www\./, "").split("/")[0];
		const width = img.properties?.width;
		const height = img.properties?.height;

		const link = document.createElement("div");
		link.className = "image-item";
		link.style.cursor = "pointer";

		const imageWrapper = document.createElement("div");
		imageWrapper.className = "image-wrapper";

		const imgEl = document.createElement("img");
		imgEl.src = thumbUrl;
		imgEl.alt = title;
		imgEl.loading = "lazy";
		imgEl.style.opacity = "0";
		imgEl.onload = () => {
			imgEl.style.opacity = "1";
		};
		imgEl.onerror = () => {
			link.style.display = "none";
		};

		if (width && height) {
			const aspectRatio = width / height;
			const itemWidth = Math.round(180 * aspectRatio);
			link.style.flexBasis = `${itemWidth}px`;
		}

		imageWrapper.append(imgEl);

		const infoDiv = document.createElement("div");
		infoDiv.className = "image-info";

		const titleDiv = document.createElement("div");
		titleDiv.className = "image-title";
		titleDiv.textContent = title;
		infoDiv.append(titleDiv);

		const sourceDiv = document.createElement("div");
		sourceDiv.className = "image-source";

		if (favicon) {
			const faviconImg = document.createElement("img");
			faviconImg.className = "favicon";
			faviconImg.src = favicon;
			faviconImg.alt = "";
			faviconImg.onerror = () => {
				faviconImg.style.display = "none";
			};
			sourceDiv.append(faviconImg);
		}

		if (sourceName) {
			const sourceNameSpan = document.createElement("span");
			sourceNameSpan.className = "source-name";
			sourceNameSpan.textContent = sourceName;
			sourceDiv.append(sourceNameSpan);
		}

		infoDiv.append(sourceDiv);

		link.append(imageWrapper);
		link.append(infoDiv);

		link.addEventListener("click", (e) => {
			e.preventDefault();
			showDetailPanel(index);
		});

		return link;
	};

	const renderImages = (results) => {
		const grid = document.getElementById("images-grid");
		const frag = document.createDocumentFragment();

		if (!results || !results.length) {
			const noResults = document.createElement("div");
			noResults.className = "no-results";
			noResults.textContent = "No images found";
			frag.append(noResults);
		} else {
			allImages = results;
			for (let i = 0; i < results.length; i++) {
				frag.append(renderImageResult(results[i], i));
			}
		}

		grid.append(frag);
	};

	const appendImages = (results) => {
		const grid = document.getElementById("images-grid");
		const frag = document.createDocumentFragment();
		const startIndex = allImages.length;

		for (let i = 0; i < results.length; i++) {
			allImages.push(results[i]);
			frag.append(renderImageResult(results[i], startIndex + i));
		}

		grid.append(frag);
	};

	const loadMoreImages = async () => {
		if (isLoading || !hasMoreResults || !currentQuery) return;

		isLoading = true;
		const loadingEl = document.getElementById("loading-indicator");
		if (loadingEl) loadingEl.style.display = "flex";

		try {
			const res = await fetch("/p", {
				method: "POST",
				headers: {
					"X-Galileo-Hash": [...`${currentQuery}${pk}`]
						.reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
						.toString(16),
					"X-Galileo-JWT": "__results_cl__",
					"X-Galileo-Pass": localStorage.getItem("galileo_pass") || `%%galileo_pass%%`,
				},
				body: pk,
			});

			pk = res.headers.get("x-galileo-upk") || pk;
			const newData = await res.json();

			if (newData.captchaHtml) {
				await solveCaptcha(newData.captchaHtml);
				loadMoreImages();
				return;
			}

			if (newData.error || !newData.results?.length) {
				hasMoreResults = false;
				if (loadingEl) loadingEl.style.display = "none";
				if (!newData.results?.length) {
					const endEl = document.createElement("div");
					endEl.className = "end-of-results";
					endEl.textContent = "No more images";
					document.getElementById("images-grid").append(endEl);
				}
				return;
			}

			appendImages(newData.results);
			hasMoreResults =
				newData.more_results_available !== false && newData.results.length > 0;
		} catch (err) {
			console.error("Failed to load more images:", err);
		} finally {
			isLoading = false;
			if (document.getElementById("loading-indicator")) {
				document.getElementById("loading-indicator").style.display = "none";
			}
		}
	};

	document.addEventListener("keydown", (e) => {
		if (selectedIndex === -1) return;

		if (e.key === "Escape") {
			closeDetailPanel();
		} else if (e.key === "ArrowLeft") {
			navigateImage(-1);
		} else if (e.key === "ArrowRight") {
			navigateImage(1);
		}
	});

	const data = __results_template__;
	hasMoreResults = data.more_results_available !== false;

	if (data.captchaHtml) {
		solveCaptcha(data.captchaHtml).then(() => {
			location.reload();
		});
	} else {
		renderImages(data.results);

		const sentinel = document.getElementById("load-more-sentinel");
		if (sentinel) {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting) {
						loadMoreImages();
					}
				},
				{
					rootMargin: "400px",
				},
			);

			if (currentQuery && hasMoreResults) {
				observer.observe(sentinel);
			}
		}
	}
})();
