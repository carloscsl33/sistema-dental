function getCalendarAppointments(date) {
  return getAppointments()
    .filter(
      ({ appointment }) =>
        appointment.date === date && appointment.status !== "Cancelada",
    )
    .map(({ appointment }) => appointment)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function openDailyAgenda(date) {
  const modal = document.querySelector("#daily-agenda-modal");
  const list = document.querySelector("#daily-agenda-list");
  const dateLabel = document.querySelector("#daily-agenda-date");
  if (!modal || !list || !dateLabel) return;

  const dateObject = new Date(`${date}T12:00:00`);
  dateLabel.textContent = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateObject);
  const appointments = getCalendarAppointments(date);
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 19 * 60; minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const matches = appointments.filter(
      (appointment) => toMinutes(appointment.time) === minutes,
    );
    const blockedCount = getBlockedAppointmentSlotCount(date, time);
    const availableCount = Math.max(
      MAX_PATIENTS_PER_SLOT - matches.length - blockedCount,
      0,
    );
    const blocked = blockedCount > 0;
    const hasSpace = availableCount > 0;
    const isPastDate = date < getISODate(0);
    const isPastTime =
      date === getISODate(0) && isAppointmentTimeInPast(date, time);
    const canBook = hasSpace && !isPastDate && !isPastTime;
    slots.push(`<div class="daily-agenda-slot ${blocked ? "is-blocked" : matches.length ? "has-appointments" : "is-free"}">
      <strong class="daily-agenda-time">${formatTimeFromInput(time)}</strong>
      <div class="daily-agenda-slot-content">${matches.length ? matches.map((appointment) => `<div class="daily-agenda-appointment"><strong>${escapeHTML(appointment.name)}</strong><span>${escapeHTML(appointment.reason || "Cita")}${appointment.status ? ` · ${escapeHTML(appointment.status)}` : ""}</span></div>`).join("") : ""}<span class="daily-agenda-free-label">${blocked ? `${blockedCount} ${blockedCount === 1 ? "lugar ocupado" : "lugares ocupados"} · ` : ""}${availableCount ? `${availableCount} ${availableCount === 1 ? "lugar disponible" : "lugares disponibles"}` : "Sin lugares disponibles"}</span></div>
      <div class="daily-agenda-slot-actions">${canBook ? `<button type="button" class="daily-agenda-book" data-agenda-book="${date}" data-agenda-time="${time}">Agendar</button>` : ""}${hasSpace && !isPastDate && !isPastTime ? `<button type="button" class="daily-agenda-block" data-agenda-block="${date}" data-agenda-time="${time}">Deshabilitar</button>` : ""}${blocked ? `<button type="button" class="daily-agenda-unblock" data-agenda-unblock="${date}" data-agenda-time="${time}">Liberar 1 lugar</button>` : ""}</div>
    </div>`);
  }
  list.innerHTML = slots.join("");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function closeDailyAgenda() {
  const modal = document.querySelector("#daily-agenda-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  updatePageScrollLock();
}

function calendarDayMarkup(year, month, day, muted = false) {
  const date = new Date(year, month, day);
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const isToday = isoDate === getISODate(0);
  const events = getCalendarAppointments(isoDate).filter(
    appointmentMatchesSearch,
  );

  return `
    <button type="button" class="day ${muted ? "muted" : ""} ${isToday ? "today" : ""}" data-calendar-date="${isoDate}" aria-label="Ver agenda del ${day} de ${MONTH_NAMES[date.getMonth()]}">
      <span>${day}</span>
      ${events
        .slice(0, 4)
        .map((event, index) => {
          const time = formatTimeFromInput(event.time);
          const patient = event.name || "Paciente sin nombre";
          return `<span class="event ${index % 2 ? "violet" : ""}" title="${escapeHTML(`${time} · ${patient}`)}">${escapeHTML(time)} · ${escapeHTML(patient)}</span>`;
        })
        .join("")}
      ${events.length > 4 ? `<span class="event">+${events.length - 4} más</span>` : ""}
    </button>
  `;
}

function renderCalendar(target) {
  if (!target) return;

  const firstDay = getFirstDayMonday(calendarYear, calendarMonth);
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const previousMonthDays = getDaysInMonth(calendarYear, calendarMonth - 1);
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push(
      calendarDayMarkup(
        calendarYear,
        calendarMonth - 1,
        previousMonthDays - i,
        true,
      ),
    );
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(calendarDayMarkup(calendarYear, calendarMonth, day));
  }

  let nextDay = 1;
  while (cells.length < 42) {
    cells.push(
      calendarDayMarkup(calendarYear, calendarMonth + 1, nextDay, true),
    );
    nextDay++;
  }

  target.innerHTML = cells.join("");
}

function updateDashboardCalendarTitle() {
  const dashboardTitle = document.querySelector("#dashboard-calendar-title");
  if (dashboardTitle) {
    dashboardTitle.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;
  }
}

function renderDashboardCalendar() {
  updateDashboardCalendarTitle();
  renderCalendar(document.querySelector("#dashboard-calendar"));
}

function changeCalendarMonth(amount) {
  calendarMonth += amount;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  }
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  renderDashboardCalendar();
}
