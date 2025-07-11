document.addEventListener('DOMContentLoaded', () => {
    // 페이지 로드 시 모든 팝업 상태 초기화
    document.body.classList.remove('sidebar-open', 'popup-open');
    
    const params = new URLSearchParams(window.location.search);
    const year = params.get("year");
    const month = params.get("month");

    if (year && month) {
        loadCalendar(year, month);
    } else {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <h1>🗓️ 캘린더를 보려면 날짜를 지정해주세요.</h1>
                <p>URL에 ?year=YYYY&month=MM 형식으로 년도와 월을 추가해주세요.</p>
                <p>예: <a href="?year=2025&month=07">?year=2025&month=07</a></p>
            </div>`;
    }

    // Add resize listener to handle layout changes
    window.addEventListener('resize', () => {
        // Close any open popups on resize to prevent layout conflicts
        closeEventDetails();
    });
});

function loadCalendar(year, month) {
    document.querySelector('.calendar-year-month .year').textContent = year;
    document.querySelector('.calendar-year-month .month').textContent = month.padStart(2, '0');

    const calendar = document.getElementById("calendar");
    calendar.innerHTML = ''; // Clear previous calendar

    fetch(`/api/calendar?year=${year}&month=${String(month).padStart(2, '0')}`)
      .then((res) => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
      })
      .then((data) => renderCalendar(data, year, month))
      .catch((err) => {
          console.error("API 요청 실패:", err);
          calendar.innerHTML = "<p>Notion에서 일정 데이터를 불러오는 데 실패했습니다. 서버 로그와 Notion 설정을 확인해주세요.</p>";
      });
}

function getColorForEvent(event) {
    if (event.holiday) return '#ffcdd2';        // Pastel Red
    if (event.exam_period) return '#fff9c4';   // Pastel Yellow
    if (event.school_event) return '#bbdefb';     // Pastel Blue
    if (event.department_event) return '#c8e6c9'; // Pastel Green
    return '#f5f5f5'; // Default light gray
}

function calculateCalendarRows(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const totalSlots = startDayOfWeek + daysInMonth;
  return Math.ceil(totalSlots / 7);
}

function updateCalendarGrid(rows) {
  const calendar = document.getElementById("calendar");
  // Ensure grid has enough rows for all days, but keep it compact
  calendar.style.gridTemplateRows = `auto repeat(${Math.max(5, rows)}, 1fr)`;
}

function renderCalendar(data, year, month) {
  const calendar = document.getElementById("calendar");
  const requiredRows = calculateCalendarRows(year, month);
  updateCalendarGrid(requiredRows);
  
  calendar.innerHTML = ''; // Clear for fresh render
  
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  dayNames.forEach(dayName => {
    const dayHeader = document.createElement('div');
    dayHeader.classList.add('day-name');
    dayHeader.textContent = dayName;
    calendar.appendChild(dayHeader);
  });
  
  const date = new Date(`${year}-${month}-01`);
  const startDay = date.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 이벤트 위치 추적을 위한 맵 (각 날짜별로 사용된 줄 추적)
  const eventPositionMap = new Map();
  
  // 먼저 모든 이벤트를 분석하여 연속 이벤트의 위치를 결정
  data.events.forEach(event => {
    if (!event.start) return;
    
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : start;
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);
    
    // 이 이벤트가 적용되는 날짜들을 찾기
    const eventDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const current = new Date(Date.UTC(year, month - 1, day));
      current.setUTCHours(0, 0, 0, 0);
      if (start <= current && current <= end) {
        eventDays.push(day);
      }
    }
    
    if (eventDays.length > 0) {
      // 이 이벤트가 들어갈 수 있는 줄 찾기 (1줄 또는 2줄)
      let targetLine = null;
      
      // 모든 관련 날짜에서 사용 가능한 줄 찾기
      for (let line = 1; line <= 2; line++) {
        let canUseThisLine = true;
        for (const day of eventDays) {
          if (!eventPositionMap.has(day)) {
            eventPositionMap.set(day, new Set());
          }
          if (eventPositionMap.get(day).has(line)) {
            canUseThisLine = false;
            break;
          }
        }
        if (canUseThisLine) {
          targetLine = line;
          break;
        }
      }
      
      // 줄이 결정되면 해당 줄을 모든 관련 날짜에 예약
      if (targetLine) {
        for (const day of eventDays) {
          if (!eventPositionMap.has(day)) {
            eventPositionMap.set(day, new Set());
          }
          eventPositionMap.get(day).add(targetLine);
        }
        event._assignedLine = targetLine;
        event._eventDays = eventDays;
      }
    }
  });

  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement("div");
    empty.classList.add("day", "empty");
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("calendar-cell");
    cell.innerHTML = `<div class="date-number">${day}</div>`;

    // 이 날짜의 모든 이벤트를 가져오기
    const dayEvents = data.events.filter((event) => {
      if (!event.start) return false;
      const start = new Date(event.start);
      const end = event.end ? new Date(event.end) : start;
      const current = new Date(Date.UTC(year, month - 1, day));
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(0, 0, 0, 0);
      current.setUTCHours(0, 0, 0, 0);
      return start <= current && current <= end && event._assignedLine;
    }).sort((a, b) => a._assignedLine - b._assignedLine);

    // 날짜 셀 클릭 이벤트 추가 (날짜별 팝업)
    cell.onclick = (e) => {
      if (e.target.classList.contains('event')) return; // 이벤트 클릭 시에는 무시
      showDayEvents(day, month, year, data.events);
    };

    dayEvents.forEach((event) => {
      const ev = document.createElement("div");
      ev.classList.add("event");
      
      // 연속 이벤트 스타일 결정
      const eventDays = event._eventDays || [day];
      const isFirstDay = eventDays[0] === day;
      const isLastDay = eventDays[eventDays.length - 1] === day;
      const isSingleDay = eventDays.length === 1;
      
      if (isSingleDay) {
        ev.classList.add("single-day");
      } else if (isFirstDay) {
        ev.classList.add("continuous-start");
      } else if (isLastDay) {
        ev.classList.add("continuous-end");
      } else {
        ev.classList.add("continuous-middle");
      }
      
      ev.textContent = event.title;
      ev.style.backgroundColor = getColorForEvent(event);
      ev.onclick = (e) => {
          e.stopPropagation();
          showEventDetails(event);
      };
      
      // 줄 위치에 따른 top 설정
      if (event._assignedLine === 1) {
        ev.style.top = '2.8vw';
      } else if (event._assignedLine === 2) {
        ev.style.top = '4.2vw';
      }
      
      cell.appendChild(ev);
    });

    calendar.appendChild(cell);
  }

  const totalCells = (requiredRows * 7) + 7; // Total cells including headers
  const currentCells = calendar.children.length;
  const remainingCells = totalCells - currentCells;

  for (let i = 0; i < remainingCells; i++) {
    const empty = document.createElement("div");
    empty.classList.add("day", "empty");
    calendar.appendChild(empty);
  }

  populateEventList(data.events);
}

function populateEventList(events) {
  const eventListUl = document.querySelector('.calendar-event-list ul');
  eventListUl.innerHTML = '';

  // 공휴일(holiday)을 제외하고 필터링
  const filteredEvents = events.filter(event => !event.holiday);
  const sortedEvents = [...filteredEvents].sort((a, b) => new Date(a.start) - new Date(b.start));
  const maxEvents = 4;
  const displayEvents = sortedEvents.slice(0, maxEvents);

  displayEvents.forEach(event => {
    const listItem = document.createElement('li');
    let eventDate = '';
    
    console.log(`Event: ${event.title}, Start: ${event.start}, End: ${event.end}`); // 디버깅 로그 추가
    
    if (event.start && event.end) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      
      // 날짜만 비교하기 위해 시간 정보 제거
      const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      
      console.log(`Start date only: ${startDateOnly}, End date only: ${endDateOnly}, Same: ${startDateOnly.getTime() === endDateOnly.getTime()}`); // 디버깅 로그 추가
      
      if (startDateOnly.getTime() === endDateOnly.getTime()) {
        // 같은 날짜인 경우
        eventDate = `(${start.getMonth() + 1}.${start.getDate()})`;
      } else {
        // 다른 날짜인 경우 (기간 이벤트)
        eventDate = `(${start.getMonth() + 1}.${start.getDate()} ~ ${end.getMonth() + 1}.${end.getDate()})`;
      }
    } else if (event.start) {
      const start = new Date(event.start);
      eventDate = `(${start.getMonth() + 1}.${start.getDate()})`;
    }
    listItem.textContent = `* ${event.title} ${eventDate}`;
    eventListUl.appendChild(listItem);
  });
}

function showDayEvents(day, month, year, allEvents) {
  // 해당 날짜의 모든 이벤트 찾기
  const dayEvents = allEvents.filter((event) => {
    if (!event.start) return false;
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : start;
    const current = new Date(Date.UTC(year, month - 1, day));
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);
    current.setUTCHours(0, 0, 0, 0);
    return start <= current && current <= end;
  });

  if (dayEvents.length === 0) {
    // 이벤트가 없는 경우 알림
    alert(`${month}월 ${day}일에는 일정이 없습니다.`);
    return;
  }

  // 팝업 제목과 내용 설정
  const popupTitle = document.getElementById('event-title-popup');
  const popupDesc = document.getElementById('event-desc-popup');
  
  popupTitle.textContent = `${month}월 ${day}일 일정`;
  
  // 이벤트 목록 생성
  let eventListHtml = '';
  dayEvents.forEach((event, index) => {
    const eventType = event.holiday ? '공휴일' : 
                     event.exam_period ? '시험 기간' :
                     event.school_event ? '학교 행사' :
                     event.department_event ? '학과 행사' : '일정';
    
    const eventColor = getColorForEvent(event);
    
    eventListHtml += `
      <div class="event-item" style="border-left-color: ${eventColor};">
        <h4>${event.title}</h4>
        <p class="event-type">${eventType}</p>
        ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
      </div>
    `;
  });
  
  popupDesc.innerHTML = eventListHtml;
  
  // 팝업 표시
  const fab = document.getElementById('fab-save-image');
  document.body.classList.add('popup-open');
  fab.classList.add('hidden');
}

function showEventDetails(event) {
  const isMobile = window.innerWidth <= 768;
  const fab = document.getElementById('fab-save-image');

  // Update content first
  if (isMobile) {
    document.getElementById('event-title-bottom').textContent = event.title;
    document.getElementById('event-desc-bottom').textContent = event.description || '설명이 없습니다.';
  } else {
    document.getElementById('event-title-sidebar').textContent = event.title;
    document.getElementById('event-desc-sidebar').textContent = event.description || '설명이 없습니다.';
  }

  // Then, trigger the animations/layout change
  if (isMobile) {
    document.body.classList.add('popup-open');
    document.body.classList.remove('sidebar-open'); // Clean up other state
  } else {
    document.body.classList.add('sidebar-open');
    document.body.classList.remove('popup-open'); // Clean up other state
  }
  
  fab.classList.add('hidden'); // Hide FAB
}

function closeEventDetails() {
  const fab = document.getElementById('fab-save-image');
  
  document.body.classList.remove('sidebar-open');
  document.body.classList.remove('popup-open');
  
  fab.classList.remove('hidden'); // Show FAB
}

function downloadCalendarImage() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get("year");
  const month = params.get("month");
  const fab = document.getElementById('fab-save-image');

  // Hide the button before taking the screenshot
  fab.style.visibility = 'hidden';

  // Ensure any open popups are closed for the screenshot
  const wasSidebarOpen = document.body.classList.contains('sidebar-open');
  const wasPopupOpen = document.body.classList.contains('popup-open');
  if (wasSidebarOpen || wasPopupOpen) {
      closeEventDetails();
  }

  // Allow time for closing animations to finish before capture
  setTimeout(() => {
      const mainContainer = document.querySelector('.main-calendar-container');
      
      // 임시로 둥근 모서리 제거
      const originalBorderRadius = mainContainer.style.borderRadius;
      mainContainer.style.borderRadius = '0';
      
      html2canvas(mainContainer, { 
          backgroundColor: "#0c7b0c", // 초록 배경색 직접 사용
          scale: 2,
          useCORS: true,
          allowTaint: true,
          onclone: (clonedDoc) => {
            // Ensure the button is also hidden in the cloned document
            const clonedFab = clonedDoc.getElementById('fab-save-image');
            if (clonedFab) {
              clonedFab.style.visibility = 'hidden';
            }
            // 클론된 문서에서도 둥근 모서리 제거
            const clonedContainer = clonedDoc.querySelector('.main-calendar-container');
            if (clonedContainer) {
              clonedContainer.style.borderRadius = '0';
            }
          }
      }).then((canvas) => {
        const fileName = `${year}-${month.padStart(2, '0')}-calendar.png`;
        const link = document.createElement("a");
        link.download = fileName;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        // 원래 둥근 모서리 복원
        mainContainer.style.borderRadius = originalBorderRadius;
        // Restore button visibility
        fab.style.visibility = 'visible';

        // Re-open the popup if it was open before
        if (wasSidebarOpen) document.body.classList.add('sidebar-open');
        if (wasPopupOpen) document.body.classList.add('popup-open');

      }).catch((error) => {
        console.error('이미지 저장 실패:', error);
        alert('이미지 저장에 실패했습니다. 다시 시도해주세요.');
        
        // 원래 둥근 모서리 복원
        mainContainer.style.borderRadius = originalBorderRadius;
        // Always restore button visibility
        fab.style.visibility = 'visible';
        if (wasSidebarOpen) document.body.classList.add('sidebar-open');
        if (wasPopupOpen) document.body.classList.add('popup-open');
      });
  }, 500); // 500ms delay for animations
}