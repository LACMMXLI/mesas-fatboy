-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FREE',
    "currentAssignmentId" TEXT,
    CONSTRAINT "RestaurantTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Shift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "arrivalOrder" INTEGER NOT NULL,
    "arrivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "skips" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShiftEmployee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RotationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "shiftEmployeeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "RotationEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RotationEntry_shiftEmployeeId_fkey" FOREIGN KEY ("shiftEmployeeId") REFERENCES "ShiftEmployee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "people" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "TableAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TableAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TableAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT,
    "employeeId" TEXT,
    "assignmentId" TEXT,
    "tableNumber" INTEGER,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'Sin usuario',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventLog_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TableAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_slug_key" ON "Branch"("slug");

-- CreateIndex
CREATE INDEX "Employee_branchId_active_idx" ON "Employee"("branchId", "active");

-- CreateIndex
CREATE INDEX "RestaurantTable_branchId_status_idx" ON "RestaurantTable"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_branchId_number_key" ON "RestaurantTable"("branchId", "number");

-- CreateIndex
CREATE INDEX "Shift_branchId_status_idx" ON "Shift"("branchId", "status");

-- CreateIndex
CREATE INDEX "ShiftEmployee_shiftId_arrivalOrder_idx" ON "ShiftEmployee"("shiftId", "arrivalOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftEmployee_shiftId_employeeId_key" ON "ShiftEmployee"("shiftId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RotationEntry_shiftEmployeeId_key" ON "RotationEntry"("shiftEmployeeId");

-- CreateIndex
CREATE INDEX "RotationEntry_shiftId_position_idx" ON "RotationEntry"("shiftId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RotationEntry_shiftId_position_key" ON "RotationEntry"("shiftId", "position");

-- CreateIndex
CREATE INDEX "TableAssignment_shiftId_assignedAt_idx" ON "TableAssignment"("shiftId", "assignedAt");

-- CreateIndex
CREATE INDEX "TableAssignment_tableId_releasedAt_idx" ON "TableAssignment"("tableId", "releasedAt");

-- CreateIndex
CREATE INDEX "EventLog_branchId_createdAt_idx" ON "EventLog"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "EventLog_shiftId_createdAt_idx" ON "EventLog"("shiftId", "createdAt");

